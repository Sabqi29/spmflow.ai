-- Tests for 20261103000000_history_retention. Run with scripts/test-db.sh.
\set ON_ERROR_STOP on
set client_min_messages = warning;
truncate auth.users cascade;
truncate public.questions, public.question_sets cascade;
truncate private.ai_cache;

insert into auth.users(id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@test'), ('00000000-0000-0000-0000-00000000000b', 'b@test');
insert into public.profiles(id, display_name, form_level) values ('00000000-0000-0000-0000-00000000000a', 'Aisyah', 5), ('00000000-0000-0000-0000-00000000000b', 'Badrul', 5);
insert into public.question_sets(id, year, title, question_count) values ('p1', 2024, 'Paper', 2);
insert into public.questions(id, set_id, question_number, stem, options, answer) values
  ('a1', 'p1', 1, 'One', '{"A":"a","B":"b","C":"c","D":"d"}', 'A'),
  ('a2', 'p1', 2, 'Two', '{"A":"a","B":"b","C":"c","D":"d"}', 'B');

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
\set B '''00000000-0000-0000-0000-00000000000b'''

-- Fixtures: attempts of different ages for A, one recent attempt for B.
insert into public.practice_attempts(id, user_id, set_id, started_at, submitted_at, score, total) values
  ('10000000-0000-0000-0000-000000000001', :A, 'p1', now() - interval '1 day', now() - interval '1 day', 1, 2),
  ('10000000-0000-0000-0000-000000000002', :A, 'p1', now() - interval '40 days', now() - interval '40 days', 2, 2),
  ('10000000-0000-0000-0000-000000000004', :A, 'p1', now() - interval '3 days', null, null, null),
  ('10000000-0000-0000-0000-000000000005', :B, 'p1', now() - interval '1 hour', now() - interval '1 hour', 0, 2);
insert into public.practice_answers(attempt_id, question_id, choice, is_correct) values
  ('10000000-0000-0000-0000-000000000001', 'a1', 'A', true), ('10000000-0000-0000-0000-000000000001', 'a2', 'C', false),
  ('10000000-0000-0000-0000-000000000002', 'a1', 'A', true), ('10000000-0000-0000-0000-000000000002', 'a2', 'B', true);
insert into public.quiz_results(user_id, form_level, score, total, created_at) values (:A, 5, 2, 2, now() - interval '40 days');
insert into public.chat_sessions(id, user_id, title, created_at) values
  ('20000000-0000-0000-0000-000000000001', :A, 'old', now() - interval '45 days'),
  ('20000000-0000-0000-0000-000000000002', :A, 'old but active', now() - interval '45 days'),
  ('20000000-0000-0000-0000-000000000003', :A, 'new', now());
insert into public.chat_messages(session_id, user_id, role, content, created_at) values
  ('20000000-0000-0000-0000-000000000001', :A, 'user', 'hi', now() - interval '45 days'),
  ('20000000-0000-0000-0000-000000000002', :A, 'user', 'hi', now() - interval '45 days'),
  ('20000000-0000-0000-0000-000000000002', :A, 'user', 'again', now() - interval '2 days');
insert into private.ai_cache(cache_key, task, form_level, response, model, created_at) values
  ('old', 'ask', 4, '{}', 'm', now() - interval '60 days'), ('new', 'ask', 4, '{}', 'm', now());
set client_min_messages = notice;

select pg_temp.check(pg_temp.fails(null, $$select * from public.get_practice_history()$$), 'guests have no history');
select pg_temp.check(pg_temp.fails(:A, $$select * from private.purge_old_history()$$), 'students cannot run the purge');
select pg_temp.check(not pg_temp.fails(null, $$select public.history_days()$$), 'anyone can read the retention days');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
select pg_temp.check((select count(*) = 2 from public.get_practice_history()), 'history lists only my submitted attempts');
select pg_temp.check((select set_title = 'Paper' and score = 1 and released and expires_at::date = (now() + interval '29 days')::date
  from public.get_practice_history() limit 1), 'newest first with title, score and expiry');
reset role;
select pg_temp.check(pg_temp.fails(:A, $$select public.delete_practice_attempt('10000000-0000-0000-0000-000000000005')$$), 'cannot delete another student''s attempt');

select * from private.purge_old_history();
select pg_temp.check((select array_agg(id::text order by id) = array['10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005'] from public.practice_attempts),
  'purge removes attempts older than 30 days and unfinished ones older than 2 days');
select pg_temp.check((select count(*) = 2 from public.practice_answers), 'answers of purged attempts go with them');
select pg_temp.check((select count(*) = 1 from public.quiz_results where user_id = :A), 'score summaries are kept for streaks');
select pg_temp.check((select array_agg(title order by title) = array['new', 'old but active'] from public.chat_sessions), 'chats are purged 30 days after the last message');
select pg_temp.check((select array_agg(cache_key) = array['new'] from private.ai_cache), 'stale AI cache is purged');

select pg_temp.check(not pg_temp.fails(:A, $$select public.delete_practice_attempt('10000000-0000-0000-0000-000000000001')$$), 'I can delete my own attempt');
select pg_temp.check((select count(*) = 1 from public.practice_attempts), 'deleted attempt is gone');
