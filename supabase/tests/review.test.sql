-- Tests for 20261028120200_review_tutor_context. Run with scripts/test-db.sh.
\set ON_ERROR_STOP on
set client_min_messages = warning;
truncate auth.users cascade;
truncate public.questions, public.question_sets, public.rag_chunks, public.textbooks cascade;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'student@test'),
  ('00000000-0000-0000-0000-00000000000b', 'other@test'),
  ('00000000-0000-0000-0000-00000000000c', 'teacher@test');
insert into public.profiles(id, display_name) values ('00000000-0000-0000-0000-00000000000a', 'A'), ('00000000-0000-0000-0000-00000000000b', 'B'), ('00000000-0000-0000-0000-00000000000c', 'C');
insert into public.question_sets(id, year, title, question_count) values ('set1', 2024, 'Test', 2);
insert into public.questions(id, set_id, question_number, stem, options, answer) values
  ('q1', 'set1', 1, 'One', '{"A":"a","B":"b","C":"c","D":"d"}', 'A'),
  ('q2', 'set1', 2, 'Two', '{"A":"a","B":"b","C":"c","D":"d"}', 'B');
insert into public.textbooks(id, form_level, title) values ('sejarah-t4', 4, 'Sejarah T4');
insert into public.question_references(question_id, textbook_id, printed_page, section_title, verified) values
  ('q1', 'sejarah-t4', 22, 'Nasionalisme', true), ('q2', 'sejarah-t4', 40, 'Draf', false);
insert into public.study_classes(id, owner_id, name, form_level) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'SEJ-5A', 5);
insert into public.class_members(class_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'owner'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'member');
insert into public.class_assignments(id, class_id, created_by, title, question_set_id, due_at, release_policy) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'Later', 'set1', now() + interval '1 day', 'after_due');
-- Attempts made directly (grading itself is covered by practice.test.sql).
insert into public.practice_attempts(id, user_id, set_id, assignment_id, mode, submitted_at, score, total) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'set1', null, 'locked', now(), 1, 2),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'set1', '20000000-0000-0000-0000-000000000001', 'locked', now(), 1, 2),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'set1', null, 'locked', null, null, null),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000b', 'set1', null, 'open', null, null, null);
insert into public.practice_answers(attempt_id, question_id, choice, is_correct) values
  ('30000000-0000-0000-0000-000000000001', 'q1', 'A', true), ('30000000-0000-0000-0000-000000000001', 'q2', 'C', false),
  ('30000000-0000-0000-0000-000000000002', 'q1', 'A', true), ('30000000-0000-0000-0000-000000000002', 'q2', 'D', false);

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

-- Textbook references: unverified pages are never shown.
set role anon;
select pg_temp.check((select count(*) = 1 and min(printed_page) = 22 from public.question_references), 'only verified references are visible');
reset role;

-- Chat linkage must point at a question in the student's own attempt.
select pg_temp.check(not pg_temp.fails(:A, $$insert into public.chat_sessions(user_id, title, attempt_id, question_id) values ('00000000-0000-0000-0000-00000000000a', 'q', '30000000-0000-0000-0000-000000000001', 'q2')$$), 'student can link a chat to their reviewed question');
select pg_temp.check(pg_temp.fails(:B, $$insert into public.chat_sessions(user_id, title, attempt_id, question_id) values ('00000000-0000-0000-0000-00000000000b', 'q', '30000000-0000-0000-0000-000000000001', 'q2')$$), 'cannot link a chat to someone else''s attempt');
select pg_temp.check(pg_temp.fails(:A, $$insert into public.chat_sessions(user_id, title, attempt_id, question_id) values ('00000000-0000-0000-0000-00000000000a', 'q', '30000000-0000-0000-0000-000000000001', 'nope')$$), 'cannot link a chat to a question outside the attempt');

-- Tutor context is service-role only and follows the release rules.
select pg_temp.check(pg_temp.fails(:A, $$select * from public.tutor_question_context('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', 'q2')$$), 'students cannot call the tutor context function');
select pg_temp.check(pg_temp.fails(:A, $$select public.tutor_locked_in('00000000-0000-0000-0000-00000000000a')$$), 'students cannot call the locked-in check');
set role service_role;
select pg_temp.check((select answer = 'B' and released and options is not null and choice = 'C' from public.tutor_question_context('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', 'q2')), 'released attempt gives the tutor the answer and options');
select pg_temp.check((select answer is null and options is null and not released and choice = 'D' from public.tutor_question_context('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000002', 'q2')), 'unreleased assignment hides answer and options from the tutor');
select pg_temp.check((select count(*) = 0 from public.tutor_question_context('00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000001', 'q2')), 'tutor context is empty for another user''s attempt');
select pg_temp.check((select not submitted and mode = 'locked' from public.tutor_question_context('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000003', 'q1')), 'in-progress locked attempt is reported as not submitted');
select pg_temp.check(public.tutor_locked_in('00000000-0000-0000-0000-00000000000a'), 'an active Locked In attempt blocks the general tutor');
select pg_temp.check(not public.tutor_locked_in('00000000-0000-0000-0000-00000000000b'), 'an Open Book attempt does not block the tutor');
reset role;
update public.practice_attempts set started_at = now() - interval '3 hours' where id = '30000000-0000-0000-0000-000000000003';
set role service_role;
select pg_temp.check(not public.tutor_locked_in('00000000-0000-0000-0000-00000000000a'), 'an abandoned attempt stops blocking after its window');
reset role;
update public.practice_attempts set started_at = now() where id = '30000000-0000-0000-0000-000000000003';

-- Abandoning only removes your own unsubmitted attempt.
select pg_temp.fails(:B, $$select public.abandon_practice('30000000-0000-0000-0000-000000000003')$$);
select pg_temp.check(exists (select 1 from public.practice_attempts where id = '30000000-0000-0000-0000-000000000003'), 'cannot abandon someone else''s attempt');
select pg_temp.fails(:A, $$select public.abandon_practice('30000000-0000-0000-0000-000000000001')$$);
select pg_temp.check(exists (select 1 from public.practice_attempts where id = '30000000-0000-0000-0000-000000000001'), 'cannot abandon a submitted attempt');
select pg_temp.check(not pg_temp.fails(:A, $$select public.abandon_practice('30000000-0000-0000-0000-000000000003')$$), 'abandon call succeeds');
select pg_temp.check(not exists (select 1 from public.practice_attempts where id = '30000000-0000-0000-0000-000000000003'), 'student can abandon their in-progress attempt');

-- Study events and aggregate teacher insights.
select pg_temp.check(not pg_temp.fails(:A, $$select public.log_study_event('reference_open', '30000000-0000-0000-0000-000000000002', 'q2')$$), 'student logs a reference open on their attempt');
select pg_temp.check(pg_temp.fails(:B, $$select public.log_study_event('reference_open', '30000000-0000-0000-0000-000000000002', 'q2')$$), 'cannot log events on another student''s attempt');
select pg_temp.check(pg_temp.fails(:A, 'select * from public.study_events'), 'students cannot read the event log');
select pg_temp.check(not pg_temp.fails(:A, $$insert into public.chat_sessions(user_id, title, attempt_id, question_id) values ('00000000-0000-0000-0000-00000000000a', 'private question text', '30000000-0000-0000-0000-000000000002', 'q2')$$), 'assignment chat linked');
select pg_temp.check(pg_temp.fails(:A, $$select public.get_assignment_insights('20000000-0000-0000-0000-000000000001')$$), 'students cannot see class insights');
set role authenticated;
select pg_temp.as_user(:C);
create temp table t_ins as select public.get_assignment_insights('20000000-0000-0000-0000-000000000001') as j;
select pg_temp.check((select (j->>'asked_ai')::int = 1 and (j->>'reference_opens')::int = 1 and (j->>'submitted')::int = 1 and (j->>'students')::int = 1 from t_ins), 'teacher sees aggregate counts');
select pg_temp.check((select j->'top_questions'->0->>'id' = 'q2' and j->'most_missed'->0->>'id' = 'q2' from t_ins), 'teacher sees which questions needed help');
select pg_temp.check((select position('private question text' in j::text) = 0 from t_ins), 'insights never include chat text');
reset role;

\echo 'All review tests passed'
