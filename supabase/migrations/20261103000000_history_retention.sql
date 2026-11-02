-- Study history for signed-in students, kept for a limited time so the free Supabase tier (500 MB) lasts.
--
-- What is kept, and for how long:
--   * Own Set Soalan attempts (paper and Ikut bab) with per-question answers: 30 days after the attempt.
--   * Class assignment attempts: 120 days, so teachers keep their class insights for a school term.
--   * Unfinished attempts (closed tab, never submitted): 2 days.
--   * Tanya AI conversations: 30 days after the last message.
--   * Cached general AI answers: 30 days (the cache already ignores older rows).
--   * quiz_results (one small row per finished quiz) is NOT purged: it drives streaks and the progress page.
-- Rough size: ~5 KB per 40-question attempt and ~2 KB per tutor answer, so an active student adds about
-- 150 KB a month. With 30 days kept, a few thousand active students fit comfortably under 500 MB.
--
-- A pg_cron job runs the purge every night at 03:00 Malaysia time (19:00 UTC).

create or replace function private.history_days() returns integer language sql immutable as $$ select 30 $$;

create or replace function private.purge_old_history()
returns table(item text, deleted bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare keep interval := make_interval(days => private.history_days()); n bigint;
begin
  delete from public.practice_attempts
  where (submitted_at is null and started_at < now() - interval '2 days')
     or (assignment_id is null and submitted_at < now() - keep)
     or (assignment_id is not null and submitted_at < now() - interval '120 days');
  get diagnostics n = row_count; item := 'practice_attempts'; deleted := n; return next;

  delete from public.chat_sessions s
  where s.created_at < now() - keep
    and not exists (select 1 from public.chat_messages m where m.session_id = s.id and m.created_at >= now() - keep);
  get diagnostics n = row_count; item := 'chat_sessions'; deleted := n; return next;

  delete from private.ai_cache where coalesce(last_hit_at, created_at) < now() - keep;
  get diagnostics n = row_count; item := 'ai_cache'; deleted := n; return next;
end;
$$;

-- The history page: own submitted attempts inside the retention window.
create or replace function private.get_practice_history(max_rows integer default 50)
returns table(attempt_id uuid, set_id text, set_title text, paper text, year integer, mode text, assignment_id uuid,
  submitted_at timestamptz, score integer, total integer, duration_seconds integer, released boolean, expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Authentication required'; end if;
  return query
  select p.id, p.set_id, s.title, s.paper, s.year, p.mode, p.assignment_id, p.submitted_at, p.score, p.total, p.duration_seconds,
    private.answers_released(p.id),
    p.submitted_at + case when p.assignment_id is null then make_interval(days => private.history_days()) else interval '120 days' end
  from public.practice_attempts p join public.question_sets s on s.id = p.set_id
  where p.user_id = me and p.submitted_at is not null
  order by p.submitted_at desc
  limit least(greatest(coalesce(max_rows, 50), 1), 200);
end;
$$;

-- Students may remove their own attempt early (not class assignment work, which the teacher relies on).
create or replace function private.delete_practice_attempt(target_attempt uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  delete from public.practice_attempts where id = target_attempt and user_id = (select auth.uid()) and assignment_id is null;
  if not found then raise exception 'Attempt not found'; end if;
end;
$$;

create or replace function public.history_days() returns integer language sql stable set search_path = '' as $$ select private.history_days(); $$;
create or replace function public.get_practice_history(max_rows integer default 50)
returns table(attempt_id uuid, set_id text, set_title text, paper text, year integer, mode text, assignment_id uuid,
  submitted_at timestamptz, score integer, total integer, duration_seconds integer, released boolean, expires_at timestamptz)
language sql stable set search_path = '' as $$ select * from private.get_practice_history(max_rows); $$;
create or replace function public.delete_practice_attempt(target_attempt uuid)
returns void language sql set search_path = '' as $$ select private.delete_practice_attempt(target_attempt); $$;

revoke all on function private.history_days(), private.purge_old_history(), private.get_practice_history(integer), private.delete_practice_attempt(uuid) from public, anon, authenticated;
grant execute on function private.history_days() to anon, authenticated;
grant execute on function private.get_practice_history(integer), private.delete_practice_attempt(uuid) to authenticated;
revoke all on function public.history_days(), public.get_practice_history(integer), public.delete_practice_attempt(uuid) from public, anon, authenticated;
grant execute on function public.history_days() to anon, authenticated;
grant execute on function public.get_practice_history(integer), public.delete_practice_attempt(uuid) to authenticated;

-- Nightly purge. Skipped where pg_cron is not installed (local test databases).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('spmflow-purge-history', '0 19 * * *', 'select * from private.purge_old_history()');
  end if;
end;
$$;
