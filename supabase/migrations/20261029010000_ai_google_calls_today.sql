-- Daily count of paid Google Search grounding calls, so the tutor can cap its backup to Wikipedia answers.
-- spmflow-ask logs those calls with a model name ending in "+google-search".
create or replace function private.ai_google_calls_today()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from private.ai_usage
  where not cache_hit and model like '%+google-search'
    and created_at >= date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur';
$$;

create or replace function public.ai_google_calls_today()
returns integer language sql stable set search_path = '' as $$ select private.ai_google_calls_today(); $$;

revoke all on function private.ai_google_calls_today(), public.ai_google_calls_today() from public, anon, authenticated;
grant execute on function private.ai_google_calls_today(), public.ai_google_calls_today() to service_role;
