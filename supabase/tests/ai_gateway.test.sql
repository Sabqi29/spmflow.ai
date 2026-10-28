-- Tests for 20261028120500_ai_gateway. Run with scripts/test-db.sh.
\set ON_ERROR_STOP on
set client_min_messages = warning;
truncate auth.users cascade;
truncate private.ai_cache, private.ai_usage;
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'student@test'), ('00000000-0000-0000-0000-0000000000ad', 'admin@test');
insert into private.app_admins(user_id) values ('00000000-0000-0000-0000-0000000000ad');

create function pg_temp.check(ok boolean, name text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', name; end if; raise notice 'ok - %', name; end $$;
create function pg_temp.fails(who uuid, sql text) returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(who::text, ''), true);
  execute format('set local role %s', case when who is null then 'anon' else 'authenticated' end);
  begin execute sql; exception when others then reset role; return true; end;
  reset role; return false;
end $$;
\set A '''00000000-0000-0000-0000-00000000000a'''
\set M '''00000000-0000-0000-0000-0000000000ad'''
set client_min_messages = notice;

-- 1. Only the Edge Function can touch the cache and the log.
select pg_temp.check(pg_temp.fails(null, $$select public.ai_cache_get('k')$$), 'guests cannot read the answer cache');
select pg_temp.check(pg_temp.fails(:A, $$select public.ai_cache_put('k', 'ask', 4, '{}', 'm')$$), 'students cannot write the answer cache');
select pg_temp.check(pg_temp.fails(:A, $$select public.log_ai_usage('ask', 'm', false, false, true, 1, 1, 1, 0)$$), 'students cannot write usage');
select pg_temp.check(pg_temp.fails(:A, $$select * from private.ai_usage$$), 'students cannot read usage rows');
select pg_temp.check(pg_temp.fails(:A, $$select * from public.get_ai_usage_summary()$$), 'students cannot read the usage summary');

-- 2. Cache round trip and hit counting, as the Edge Function.
set role service_role;
select pg_temp.check(public.ai_cache_get('k1') is null, 'cache miss returns null');
select public.ai_cache_put('k1', 'ask', 4, '{"text":"Jawapan"}', 'gemini-2.5-flash-lite');
select pg_temp.check(public.ai_cache_get('k1') ->> 'text' = 'Jawapan', 'cache hit returns the stored response');
reset role;
select pg_temp.check((select hits = 1 from private.ai_cache where cache_key = 'k1'), 'hits are counted');
update private.ai_cache set created_at = now() - interval '40 days' where cache_key = 'k1';
set role service_role;
select pg_temp.check(public.ai_cache_get('k1') is null, 'entries older than 30 days are ignored');

-- 3. Usage log feeds the daily cap and the admin summary.
select public.log_ai_usage('ask', 'gemini-2.5-flash-lite', false, false, true, 1000, 200, 900, 0.00018);
select public.log_ai_usage('ask', 'gemini-2.5-flash-lite', true, false, false, null, null, 40, 0);
select public.log_ai_usage('ask', null, false, true, true, null, null, 300, 0);
select pg_temp.check(public.ai_calls_today() = 1, 'only real model calls count toward the cap');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
select pg_temp.check((select requests = 3 and model_calls = 1 and cache_hits = 1 and extractive = 1 and prompt_tokens = 1000 from public.get_ai_usage_summary()), 'admin summary aggregates the day');
reset role;

\echo 'All AI gateway tests passed'
