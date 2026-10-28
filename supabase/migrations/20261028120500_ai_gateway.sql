-- AI gateway bookkeeping for spmflow-ask: an answer cache for general textbook questions, a usage log
-- (no question or answer text, no user ids) and a site-wide daily cap. Only the Edge Function (service_role)
-- reads or writes these; admins see an aggregate summary.

create table private.ai_cache (
  cache_key text primary key,
  task text not null,
  form_level smallint not null,
  response jsonb not null,
  model text not null,
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz
);

create table private.ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  task text not null,
  model text,
  cache_hit boolean not null default false,
  degraded boolean not null default false,
  is_guest boolean not null default true,
  prompt_tokens integer,
  output_tokens integer,
  latency_ms integer,
  est_cost_usd numeric(12, 8)
);
create index ai_usage_created_idx on private.ai_usage(created_at);
revoke all on private.ai_cache, private.ai_usage from public, anon, authenticated;

-- Returns the cached response (and counts the hit) when it is younger than max_age_days.
create or replace function private.ai_cache_get(target_key text, max_age_days integer default 30)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  update private.ai_cache set hits = hits + 1, last_hit_at = now()
  where cache_key = target_key and created_at > now() - make_interval(days => max_age_days)
  returning response;
$$;

create or replace function private.ai_cache_put(target_key text, task_name text, level integer, payload jsonb, model_name text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.ai_cache(cache_key, task, form_level, response, model)
  values (target_key, task_name, level, payload, model_name)
  on conflict (cache_key) do update set response = excluded.response, model = excluded.model, created_at = now(), hits = 0;
$$;

create or replace function private.log_ai_usage(task_name text, model_name text, was_cache_hit boolean, was_degraded boolean,
  guest boolean, prompt_count integer, output_count integer, elapsed_ms integer, cost numeric)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.ai_usage(task, model, cache_hit, degraded, is_guest, prompt_tokens, output_tokens, latency_ms, est_cost_usd)
  values (task_name, model_name, was_cache_hit, was_degraded, guest, prompt_count, output_count, elapsed_ms, cost);
$$;

-- Model calls made today (Malaysia time), for the site-wide cap.
create or replace function private.ai_calls_today()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from private.ai_usage
  where not cache_hit and model is not null
    and created_at >= date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur';
$$;

-- Daily totals for admins: no text, no users.
create or replace function private.get_ai_usage_summary(days integer default 14)
returns table(day date, requests bigint, model_calls bigint, cache_hits bigint, extractive bigint, prompt_tokens bigint, output_tokens bigint, est_cost_usd numeric, avg_latency_ms integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_app_admin() then raise exception 'Admin access required'; end if;
  return query
  select (u.created_at at time zone 'Asia/Kuala_Lumpur')::date, count(*),
    count(*) filter (where not u.cache_hit and u.model is not null), count(*) filter (where u.cache_hit), count(*) filter (where u.degraded),
    coalesce(sum(u.prompt_tokens), 0)::bigint, coalesce(sum(u.output_tokens), 0)::bigint, coalesce(sum(u.est_cost_usd), 0), avg(u.latency_ms)::integer
  from private.ai_usage u
  where u.created_at > now() - make_interval(days => least(greatest(coalesce(days, 14), 1), 90))
  group by 1 order by 1 desc;
end;
$$;

create or replace function public.ai_cache_get(target_key text, max_age_days integer default 30)
returns jsonb language sql set search_path = '' as $$ select private.ai_cache_get(target_key, max_age_days); $$;
create or replace function public.ai_cache_put(target_key text, task_name text, level integer, payload jsonb, model_name text)
returns void language sql set search_path = '' as $$ select private.ai_cache_put(target_key, task_name, level, payload, model_name); $$;
create or replace function public.log_ai_usage(task_name text, model_name text, was_cache_hit boolean, was_degraded boolean,
  guest boolean, prompt_count integer, output_count integer, elapsed_ms integer, cost numeric)
returns void language sql set search_path = '' as $$ select private.log_ai_usage(task_name, model_name, was_cache_hit, was_degraded, guest, prompt_count, output_count, elapsed_ms, cost); $$;
create or replace function public.ai_calls_today()
returns integer language sql stable set search_path = '' as $$ select private.ai_calls_today(); $$;
create or replace function public.get_ai_usage_summary(days integer default 14)
returns table(day date, requests bigint, model_calls bigint, cache_hits bigint, extractive bigint, prompt_tokens bigint, output_tokens bigint, est_cost_usd numeric, avg_latency_ms integer)
language sql stable set search_path = '' as $$ select * from private.get_ai_usage_summary(days); $$;

revoke all on function
  private.ai_cache_get(text, integer), private.ai_cache_put(text, text, integer, jsonb, text),
  private.log_ai_usage(text, text, boolean, boolean, boolean, integer, integer, integer, numeric), private.ai_calls_today(),
  private.get_ai_usage_summary(integer),
  public.ai_cache_get(text, integer), public.ai_cache_put(text, text, integer, jsonb, text),
  public.log_ai_usage(text, text, boolean, boolean, boolean, integer, integer, integer, numeric), public.ai_calls_today(),
  public.get_ai_usage_summary(integer)
  from public, anon, authenticated;
grant execute on function
  private.ai_cache_get(text, integer), private.ai_cache_put(text, text, integer, jsonb, text),
  private.log_ai_usage(text, text, boolean, boolean, boolean, integer, integer, integer, numeric), private.ai_calls_today(),
  public.ai_cache_get(text, integer), public.ai_cache_put(text, text, integer, jsonb, text),
  public.log_ai_usage(text, text, boolean, boolean, boolean, integer, integer, integer, numeric), public.ai_calls_today()
  to service_role;
grant execute on function private.get_ai_usage_summary(integer), public.get_ai_usage_summary(integer) to authenticated;
