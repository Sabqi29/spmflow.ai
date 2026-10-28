-- Tests for 20261028120400_reference_review. Run with scripts/test-db.sh.
\set ON_ERROR_STOP on
set client_min_messages = warning;
truncate auth.users cascade;
truncate public.questions, public.question_sets, public.rag_chunks, public.textbooks cascade;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'student@test'), ('00000000-0000-0000-0000-0000000000ad', 'admin@test');
insert into private.app_admins(user_id) values ('00000000-0000-0000-0000-0000000000ad');
insert into public.textbooks(id, form_level, title) values ('sejarah-t4', 4, 'T4'), ('sejarah-t5', 5, 'T5');
insert into public.rag_chunks(id, form, chapter_id, chapter_title, section_title, current_page, page_start, page_end, content) values
  ('c1', 'Form 4', 2, 'Kebangkitan Nasionalisme', 'Maksud nasionalisme', 22, 22, 23, 'Nasionalisme'),
  ('c2', 'Form 5', 1, 'Kedaulatan Negara', 'Konsep kedaulatan', 6, 4, 7, 'Kedaulatan');
insert into public.question_sets(id, year, title, question_count) values ('set1', 2024, 'Test', 3);
insert into public.questions(id, set_id, question_number, stem, options, answer, form_level, chapter_id) values
  ('q1', 'set1', 1, 'One', '{"A":"a","B":"b","C":"c","D":"d"}', 'A', 4, 2),
  ('q2', 'set1', 2, 'Two', '{"A":"a","B":"b","C":"c","D":"d"}', 'B', 4, 2),
  ('q3', 'set1', 3, 'Three', '{"A":"a","B":"b","C":"c","D":"d"}', 'C', 4, 2);
insert into public.question_references(id, question_id, textbook_id, rag_chunk_id, chapter_id, printed_page, section_title, confidence) values
  ('30000000-0000-0000-0000-000000000001', 'q1', 'sejarah-t4', 'c1', 2, 22, 'Maksud nasionalisme', 0.9),
  ('30000000-0000-0000-0000-000000000002', 'q2', 'sejarah-t4', 'c1', 2, 22, 'Maksud nasionalisme', 0.4),
  ('30000000-0000-0000-0000-000000000003', 'q3', 'sejarah-t4', 'c1', 2, 22, 'Maksud nasionalisme', 0.3);

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
\set M '''00000000-0000-0000-0000-0000000000ad'''
set client_min_messages = notice;

-- 1. Only admins reach the queue; nobody can add themselves as admin.
select pg_temp.check(pg_temp.fails(null, 'select * from public.get_reference_queue()'), 'guests cannot open the review queue');
select pg_temp.check(pg_temp.fails(:A, 'select * from public.get_reference_queue()'), 'students cannot open the review queue');
select pg_temp.check(pg_temp.fails(:A, $$select public.review_reference('30000000-0000-0000-0000-000000000001', 'verify')$$), 'students cannot verify references');
select pg_temp.check(pg_temp.fails(:A, $$insert into private.app_admins values ('00000000-0000-0000-0000-00000000000a')$$), 'students cannot make themselves admin');
select pg_temp.check(pg_temp.fails(:A, $$update public.question_references set verified = true$$), 'students cannot verify by writing the table');
set role authenticated;
select pg_temp.as_user(:A);
select pg_temp.check(not public.is_app_admin(), 'a student is not an admin');
select pg_temp.as_user(:M);
select pg_temp.check(public.is_app_admin(), 'the listed admin is an admin');
select pg_temp.check((select count(*) = 3 and min(pending) = 3 from public.get_reference_queue()), 'admin sees every pending suggestion');
select pg_temp.check((select reference_id = '30000000-0000-0000-0000-000000000001' and answer = 'A' and chapter_title = 'Kebangkitan Nasionalisme' from public.get_reference_queue() limit 1), 'queue lists the most confident first, with answer and chapter title');

-- 2. Verify as suggested, verify with a correction, reject.
select public.review_reference('30000000-0000-0000-0000-000000000001', 'verify');
select public.review_reference('30000000-0000-0000-0000-000000000002', 'verify', 5, 1, 7);
select public.review_reference('30000000-0000-0000-0000-000000000003', 'reject');
select pg_temp.check((select verified and verified_by = '00000000-0000-0000-0000-0000000000ad' and mapping_source = 'ai' and printed_page = 22 from public.question_references where question_id = 'q1'), 'verify keeps the suggestion and records who verified it');
select pg_temp.check((select verified and textbook_id = 'sejarah-t5' and chapter_id = 1 and printed_page = 7 and mapping_source = 'admin' and rag_chunk_id is null from public.question_references where question_id = 'q2'), 'a correction replaces the page and marks it admin-made');
select pg_temp.check((select form_level = 5 and chapter_id = 1 from public.questions where id = 'q2'), 'a correction fixes the question chapter tag');
select pg_temp.check(not exists (select 1 from public.question_references where question_id = 'q3'), 'reject removes the suggestion');
select pg_temp.check((select chapter_id is null from public.questions where id = 'q3'), 'reject clears the unverified chapter tag');
select pg_temp.check((select count(*) = 0 from public.get_reference_queue()), 'the queue is empty once everything is reviewed');
select pg_temp.check(pg_temp.fails(:M, $$select public.review_reference('30000000-0000-0000-0000-000000000001', 'verify', 5, 99)$$), 'unknown chapters are refused');
reset role;

-- 3. Verified references become visible to students.
set role authenticated;
select pg_temp.as_user(:A);
select pg_temp.check((select count(*) = 2 from public.question_references), 'students see verified references only');
reset role;

\echo 'All reference review tests passed'
