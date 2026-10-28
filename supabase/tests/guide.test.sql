-- Tests for 20261028120300_study_guide_class_board and the reference-suggestion job.
\set ON_ERROR_STOP on
set client_min_messages = warning;
truncate auth.users cascade;
truncate public.questions, public.question_sets, public.rag_chunks, public.textbooks cascade;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'student@test'), ('00000000-0000-0000-0000-00000000000b', 'other@test'),
  ('00000000-0000-0000-0000-00000000000c', 'teacher@test'), ('00000000-0000-0000-0000-00000000000d', 'teacher2@test'),
  ('00000000-0000-0000-0000-00000000000e', 'teacher3@test');
insert into public.profiles(id, display_name, school_name) values
  ('00000000-0000-0000-0000-00000000000a', 'A', 'SMK Bandar'), ('00000000-0000-0000-0000-00000000000b', 'B', ''),
  ('00000000-0000-0000-0000-00000000000c', 'C', 'SMK Bandar'), ('00000000-0000-0000-0000-00000000000d', 'D', 'smk bandar '),
  ('00000000-0000-0000-0000-00000000000e', 'E', 'SMK Lain');
insert into public.textbooks(id, form_level, title) values ('sejarah-t4', 4, 'T4'), ('sejarah-t5', 5, 'T5');
insert into public.rag_chunks(id, form, chapter_id, chapter_title, section_title, current_page, page_start, page_end, content) values
  ('c1', 'Form 4', 2, 'Kebangkitan Nasionalisme', 'Maksud nasionalisme', 22, 22, 23, 'Nasionalisme ialah semangat cinta akan bangsa dan tanah air. Gerakan nasionalisme di Asia.'),
  ('c2', 'Form 4', 2, 'Kebangkitan Nasionalisme', 'Nasionalisme di Asia', 25, 24, 26, 'Gerakan nasionalisme di India, China dan Turki menentang penjajahan.'),
  ('c3', 'Form 4', 9, 'Perlembagaan Persekutuan Tanah Melayu 1957', 'Ciri perlembagaan', 218, 216, 219, 'Perlembagaan menetapkan kedudukan Raja-raja Melayu, agama Islam dan bahasa Melayu.'),
  ('c4', 'Form 5', 1, 'Kedaulatan Negara', 'Konsep kedaulatan', 6, 4, 7, 'Kedaulatan negara bermaksud kuasa tertinggi negara.');
insert into public.question_sets(id, year, title, question_count) values ('set1', 2024, 'Test', 3);
insert into public.questions(id, set_id, question_number, stem, options, answer) values
  ('q1', 'set1', 1, 'Apakah maksud nasionalisme?', '{"A":"Semangat cinta akan bangsa","B":"Penjajahan","C":"Ekonomi","D":"Perdagangan"}', 'A'),
  ('q2', 'set1', 2, 'Gerakan nasionalisme di Turki menentang', '{"A":"penjajahan","B":"pendidikan","C":"pertanian","D":"perlembagaan"}', 'A'),
  ('q3', 'set1', 3, 'Perlembagaan 1957 menetapkan kedudukan Raja-raja Melayu', '{"A":"agama Islam","B":"bahasa Melayu","C":"kedua-dua","D":"tiada"}', 'C');

create function pg_temp.check(ok boolean, name text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', name; end if; raise notice 'ok - %', name; end $$;
create function pg_temp.fails(who uuid, sql text) returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(who::text, ''), true);
  execute format('set local role %s', case when who is null then 'anon' else 'authenticated' end);
  begin execute sql; exception when others then reset role; return true; end;
  reset role; return false;
end $$;
create function pg_temp.as_user(who uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(who::text, ''), false); end $$;
\set A '''00000000-0000-0000-0000-00000000000a'''
\set B '''00000000-0000-0000-0000-00000000000b'''
set client_min_messages = notice;

-- Reference suggestions: stored unverified, chapter tags set on questions.
\i supabase/scripts/suggest_question_references.sql
select pg_temp.check((select count(*) = 3 and bool_and(not verified and mapping_source = 'ai') from public.question_references), 'one unverified suggestion per question');
select pg_temp.check((select chapter_id = 2 and form_level = 4 from public.questions where id = 'q1'), 'nationalism question tagged to T4 chapter 2');
select pg_temp.check((select chapter_id = 9 from public.questions where id = 'q3'), 'constitution question tagged to T4 chapter 9');
select pg_temp.check((select printed_page = 218 from public.question_references where question_id = 'q3'), 'suggested page comes from the best chunk in that chapter');
set role anon;
select pg_temp.check((select count(*) = 0 from public.question_references), 'unverified suggestions stay hidden from students');
reset role;
update public.question_references set verified = true where question_id = 'q1';
\i supabase/scripts/suggest_question_references.sql
select pg_temp.check((select count(*) = 1 from public.question_references where question_id = 'q1' and verified), 're-running keeps verified references');
select pg_temp.check((select count(*) = 3 from public.question_references), 're-running does not duplicate suggestions');

-- Study guide: by chapter, from released attempts only.
insert into public.study_classes(id, owner_id, name, form_level) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', '4A', 4),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000d', '4B', 4),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000e', 'Other school', 4);
insert into public.class_members(class_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'owner'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'member'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000d', 'owner'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000e', 'owner');
insert into public.class_assignments(id, class_id, created_by, title, question_set_id, release_policy) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'Hidden', 'set1', 'never'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000d', 'B', 'set1', 'immediate');
insert into public.practice_attempts(id, user_id, set_id, assignment_id, submitted_at, score, total) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'set1', null, now(), 1, 3),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'set1', '20000000-0000-0000-0000-000000000001', now(), 3, 3);
insert into public.practice_answers(attempt_id, question_id, choice, is_correct) values
  ('30000000-0000-0000-0000-000000000001', 'q1', 'A', true), ('30000000-0000-0000-0000-000000000001', 'q2', 'B', false), ('30000000-0000-0000-0000-000000000001', 'q3', 'A', false),
  ('30000000-0000-0000-0000-000000000002', 'q1', 'A', true), ('30000000-0000-0000-0000-000000000002', 'q2', 'A', true), ('30000000-0000-0000-0000-000000000002', 'q3', 'C', true);
insert into public.quiz_results(user_id, form_level, score, total, assignment_id) values
  ('00000000-0000-0000-0000-00000000000a', 4, 3, 4, '20000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-00000000000b', 4, 4, 4, '20000000-0000-0000-0000-000000000002');

select pg_temp.check(pg_temp.fails(null, 'select * from public.get_study_guide()'), 'guests have no study guide');
set role authenticated;
select pg_temp.as_user(:A);
select pg_temp.check((select answered = 2 and correct = 1 and accuracy = 50 from public.get_study_guide() where form_level = 4 and chapter_id = 2), 'chapter 2 accuracy uses only released attempts');
select pg_temp.check((select answered = 1 and accuracy = 0 from public.get_study_guide() where form_level = 4 and chapter_id = 9), 'weak chapter shows 0%');
select pg_temp.check((select answered = 0 and accuracy is null and page_start = 4 from public.get_study_guide() where form_level = 5 and chapter_id = 1), 'unpractised chapters are listed with their first page');
select pg_temp.as_user(:B);
select pg_temp.check((select coalesce(sum(answered), 0) = 0 from public.get_study_guide()), 'another student''s answers are not in my guide');

-- School class board.
select pg_temp.as_user(:A);
create temp table t_board as select * from public.get_school_class_board('10000000-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) = 2 from t_board), 'board lists classes from the same school only');
select pg_temp.check((select class_name = '4B' and accuracy = 100 from t_board order by accuracy desc limit 1), 'board ranks by weekly accuracy');
select pg_temp.check((select is_mine and accuracy = 75 and members = 1 from t_board where class_name = '4A'), 'my class is flagged');
reset role;
select pg_temp.check(pg_temp.fails(:B, $$select * from public.get_school_class_board('10000000-0000-0000-0000-000000000001')$$), 'non-members cannot see a class board');

\echo 'All guide tests passed'
