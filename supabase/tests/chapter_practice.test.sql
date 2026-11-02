-- Tests for 20261102230000_chapter_practice. Run with scripts/test-db.sh.
\set ON_ERROR_STOP on
set client_min_messages = warning;
truncate auth.users cascade;
truncate public.questions, public.question_sets cascade;

insert into auth.users(id, email) values ('00000000-0000-0000-0000-00000000000a', 'student@test');
insert into public.profiles(id, display_name, form_level) values ('00000000-0000-0000-0000-00000000000a', 'Aisyah', 5);
insert into public.question_sets(id, year, title, question_count) values ('p1', 2024, 'Paper', 3), ('p2', 2024, 'Paper 2', 2);
insert into public.question_sets(id, year, title, paper, question_count) values ('bab-t4-2', 0, 'Tingkatan 4 · Bab 2', 'BAB', 3), ('bab-t4-3', 0, 'Tingkatan 4 · Bab 3', 'BAB', 1);
insert into public.questions(id, set_id, question_number, stem, options, answer, form_level, chapter_id) values
  ('a1', 'p1', 1, 'One', '{"A":"a","B":"b","C":"c","D":"d"}', 'A', 4, 2),
  ('a2', 'p1', 2, 'Two', '{"A":"a","B":"b","C":"c","D":"d"}', 'B', 4, 3),
  ('a3', 'p1', 3, 'Three', '{"A":"a","B":"b","C":"c","D":"d"}', 'C', null, null),
  ('b1', 'p2', 1, 'Four', '{"A":"a","B":"b","C":"c","D":"d"}', 'D', 4, 2),
  ('b2', 'p2', 2, 'Five', '{"A":"a","B":"b","C":"c","D":"d"}', 'A', 4, 2);

create function pg_temp.fails(who uuid, sql text) returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(who::text, ''), true);
  execute format('set local role %s', case when who is null then 'anon' else 'authenticated' end);
  begin execute sql; exception when others then reset role; return true; end;
  reset role; return false;
end $$;
create function pg_temp.check(ok boolean, name text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', name; end if; raise notice 'ok - %', name; end $$;

\set A '''00000000-0000-0000-0000-00000000000a'''
set client_min_messages = notice;

select pg_temp.check(pg_temp.fails(:A, $$select public.start_practice(target_set => 'bab-t4-2')$$), 'a chapter round needs its drawn questions');
select pg_temp.check(pg_temp.fails(:A, $$select public.start_practice(target_set => 'bab-t4-2', target_questions => array['a1','a2'])$$), 'questions from another chapter are refused');
select pg_temp.check(pg_temp.fails(:A, $$select public.start_practice(target_set => 'bab-t4-2', target_questions => array['a1','zz'])$$), 'unknown questions are refused');
select pg_temp.check(not pg_temp.fails(:A, $$select public.start_practice(target_set => 'p1', requested_mode => 'open')$$), 'paper sets still start without question ids');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
create temp table chapter_attempt as select public.start_practice(target_set => 'bab-t4-2', requested_mode => 'locked', target_questions => array['a1','b2']) as id;
create temp table chapter_score as select * from public.submit_practice((select id from chapter_attempt), '{"a1":"A","b1":"D"}');
reset role;
select pg_temp.check((select score = 1 and total = 2 from chapter_score), 'only the drawn questions are graded (b1 was not drawn)');
select pg_temp.check((select count(*) = 2 from public.practice_answers where attempt_id = (select id from chapter_attempt)), 'answers stored for drawn questions');
select pg_temp.check((select form_level = 4 and question_set_id = 'bab-t4-2' from public.quiz_results order by created_at desc limit 1), 'result is saved under the chapter and its form');
set role authenticated;
select pg_temp.check((select count(*) = 2 from public.get_practice_review((select id from chapter_attempt))), 'review lists the drawn questions');
reset role;

select pg_temp.check((select count(*) = 2 and count(*) filter (where is_correct) = 1 from public.grade_guest_practice('bab-t4-2', '{"a1":"A","b2":null}')), 'guest chapter grading covers only the sent questions');
select pg_temp.check((select count(*) = 0 from public.grade_guest_practice('bab-t4-2', '{"a2":"B"}')), 'guest chapter grading ignores questions from other chapters');
select pg_temp.check((select count(*) = 3 from public.grade_guest_practice('p1', '{}')), 'guest paper grading is unchanged');
