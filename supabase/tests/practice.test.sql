-- Tests for 20261028120000_server_side_practice. Run with scripts/test-db.sh.
-- Each check raises an exception on failure; psql runs with ON_ERROR_STOP.
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'student@test'),
  ('00000000-0000-0000-0000-00000000000b', 'other@test'),
  ('00000000-0000-0000-0000-00000000000c', 'teacher@test');
insert into public.profiles(id, display_name, form_level) values
  ('00000000-0000-0000-0000-00000000000a', 'Aisyah', 4),
  ('00000000-0000-0000-0000-00000000000b', 'Badrul', 5),
  ('00000000-0000-0000-0000-00000000000c', 'Cikgu', 5);
insert into public.question_sets(id, year, title, question_count) values ('set1', 2024, 'Test set', 3), ('set2', 2024, 'Other', 1);
insert into public.questions(id, set_id, question_number, stem, options, answer) values
  ('q1', 'set1', 1, 'One', '{"A":"a","B":"b","C":"c","D":"d"}', 'A'),
  ('q2', 'set1', 2, 'Two', '{"A":"a","B":"b","C":"c","D":"d","I":"x","II":"y"}', 'B'),
  ('q3', 'set1', 3, 'Three', '{"A":"a","B":"b","C":"c","D":"d"}', 'C'),
  ('z1', 'set2', 1, 'Other', '{"A":"a","B":"b","C":"c","D":"d"}', 'D');
insert into public.study_classes(id, owner_id, name, form_level) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'SEJ-5A', 5);
insert into public.class_members(class_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'owner'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'member');
insert into public.class_assignments(id, class_id, created_by, title, question_set_id, due_at, release_policy, mode) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'Due later', 'set1', now() + interval '2 days', 'after_due', 'locked'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'Due passed', 'set1', now() - interval '1 hour', 'after_due', 'locked'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'Manual', 'set1', null, 'manual', 'open'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'Never', 'set1', null, 'never', 'locked'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'Immediate', 'set1', now() + interval '2 days', 'immediate', 'locked');

-- Runs `sql` as the given user (null = anon) and returns whether it raised.
create function pg_temp.fails(who uuid, sql text) returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(who::text, ''), true);
  execute format('set local role %s', case when who is null then 'anon' else 'authenticated' end);
  begin execute sql; exception when others then reset role; return true; end;
  reset role; return false;
end $$;
create function pg_temp.check(ok boolean, name text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', name; end if; raise notice 'ok - %', name; end $$;
create function pg_temp.as_user(who uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(who::text, ''), false); end $$;

\set A '''00000000-0000-0000-0000-00000000000a'''
\set B '''00000000-0000-0000-0000-00000000000b'''
\set C '''00000000-0000-0000-0000-00000000000c'''

set client_min_messages = notice;

-- 1. The answer key is unreadable from the API roles.
select pg_temp.check(not pg_temp.fails(null, 'select id, stem, options from public.questions'), 'guests can read questions without answers');
select pg_temp.check(pg_temp.fails(null, 'select answer from public.questions'), 'guests cannot read the answer column');
select pg_temp.check(pg_temp.fails(:A, 'select answer from public.questions'), 'students cannot read the answer column');
select pg_temp.check(pg_temp.fails(:A, 'select * from public.questions'), 'select * on questions is refused (answer column hidden)');
select pg_temp.check(pg_temp.fails(:A, 'select * from public.practice_answers'), 'students cannot read stored per-question correctness directly');

-- 2. Scores can no longer be forged.
select pg_temp.check(pg_temp.fails(:A, $$insert into public.quiz_results(user_id, form_level, score, total) values ('00000000-0000-0000-0000-00000000000a', 4, 40, 40)$$), 'students cannot insert quiz_results directly');
select pg_temp.check(pg_temp.fails(null, $$select public.start_practice('set1')$$), 'guests cannot start a stored attempt');

-- 3. Personal practice is graded on the server and released straight away.
set role authenticated;
select pg_temp.as_user(:A);
create temp table t_attempt as select public.start_practice('set1') as id;
grant all on t_attempt to anon, authenticated;
create temp table t_score as select * from public.submit_practice((select id from t_attempt), '{"q1":"A","q2":"C","q3":"E","z1":"D","bogus":"A"}');
grant all on t_score to anon, authenticated;
select pg_temp.check((select score = 1 and total = 3 and released from t_score), 'server grades only valid choices for questions in the set');
select pg_temp.check((select count(*) = 3 and bool_and(answer is not null) from public.get_practice_review((select id from t_attempt))), 'personal review shows correct answers');
select pg_temp.check((select choice is null from public.get_practice_review((select id from t_attempt)) where question_id = 'q3'), 'invalid choice stored as unanswered');
select pg_temp.check((select count(*) = 1 from public.quiz_results where question_set_id = 'set1' and score = 1 and form_level = 4), 'quiz_results row written by the server with the profile form');
reset role;
select pg_temp.check(pg_temp.fails(:A, format('select * from public.submit_practice(%L, %L)', (select id from t_attempt), '{"q1":"A","q2":"B","q3":"C"}')), 'an attempt cannot be resubmitted');
select pg_temp.check(pg_temp.fails(:B, format('select * from public.get_practice_review(%L)', (select id from t_attempt))), 'another student cannot read my review');
select pg_temp.check(pg_temp.fails(:B, format('select * from public.submit_practice(%L, %L)', (select id from t_attempt), '{}')), 'another student cannot submit my attempt');
select pg_temp.check(not pg_temp.fails(:B, 'select 1 where not exists (select 1 from public.practice_attempts where user_id <> ''00000000-0000-0000-0000-00000000000b'')'), 'students only see their own attempts');

-- 4. Assignments: membership, set and mode are enforced.
select pg_temp.check(pg_temp.fails(:B, $$select public.start_practice('set1', '20000000-0000-0000-0000-000000000001')$$), 'non-members cannot start an assignment');
select pg_temp.check(pg_temp.fails(:A, $$select public.start_practice('set2', '20000000-0000-0000-0000-000000000001')$$), 'assignment attempt must use the assigned set');
set role authenticated;
select pg_temp.as_user(:A);
create temp table t_assign as select a.label, public.start_practice('set1', a.id, 'open') as id from (values
  ('later', '20000000-0000-0000-0000-000000000001'::uuid), ('passed', '20000000-0000-0000-0000-000000000002'::uuid),
  ('manual', '20000000-0000-0000-0000-000000000003'::uuid), ('never', '20000000-0000-0000-0000-000000000004'::uuid),
  ('immediate', '20000000-0000-0000-0000-000000000005'::uuid)) a(label, id);
select pg_temp.check((select mode = 'locked' from public.practice_attempts where id = (select id from t_assign where label = 'later')), 'teacher mode overrides the requested mode');
select pg_temp.check((select mode = 'open' from public.practice_attempts where id = (select id from t_assign where label = 'manual')), 'open-book assignments start in open mode');
select pg_temp.check((select bool_and(r.released = (t.label in ('passed','immediate'))) from t_assign t cross join lateral public.submit_practice(t.id, '{"q1":"A","q2":"B","q3":"C"}') r), 'release flag follows each policy on submit');
select pg_temp.check((select bool_and(answer is null and is_correct is null and choice is not null) from public.get_practice_review((select id from t_assign where label = 'later'))), 'after_due hides answers before the due date');
select pg_temp.check((select bool_and(answer is not null) from public.get_practice_review((select id from t_assign where label = 'passed'))), 'after_due shows answers once the due date passes');
select pg_temp.check((select bool_and(answer is null) from public.get_practice_review((select id from t_assign where label = 'never'))), 'never keeps answers hidden');
select pg_temp.check((select bool_and(answer is null) from public.get_practice_review((select id from t_assign where label = 'manual'))), 'manual hides answers until released');
select pg_temp.check((select count(*) = 5 and bool_and(form_level = 5) from public.quiz_results where assignment_id is not null), 'assignment scores use the class form and reach the class leaderboard');
reset role;
select pg_temp.check(pg_temp.fails(:A, $$update public.class_assignments set release_policy = 'immediate' where id = '20000000-0000-0000-0000-000000000004'$$) or not exists (select 1 from public.class_assignments where id = '20000000-0000-0000-0000-000000000004' and release_policy = 'immediate'), 'students cannot change release settings');
set role authenticated;
select pg_temp.as_user(:C);
update public.class_assignments set released_at = now() where id = '20000000-0000-0000-0000-000000000003';
select pg_temp.as_user(:A);
select pg_temp.check((select bool_and(answer is not null) from public.get_practice_review((select id from t_assign where label = 'manual'))), 'manual release by the teacher reveals answers');
reset role;

-- 5. Guests can still practise; nothing is stored.
set role anon;
select pg_temp.as_user(null);
select pg_temp.check((select count(*) = 3 and count(*) filter (where is_correct) = 2 from public.grade_guest_practice('set1', '{"q1":"A","q2":"B"}')), 'guest grading returns per-question results');
reset role;
select pg_temp.check((select count(*) = 6 from public.practice_attempts), 'guest grading stores no attempt');

\echo 'All practice tests passed'
