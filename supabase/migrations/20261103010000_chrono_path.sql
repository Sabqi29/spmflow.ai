-- Laluan Masa: a daily puzzle where students draw one line through every cell of a grid,
-- passing textbook events in chronological order. Ranked by fastest time for the day.
-- The puzzle for each day (grid size + checkpoint cells in order) is seeded by
-- 20261103010100_chrono_puzzles_seed.sql, generated from data/chronology/kronologi.txt.
-- The server keeps the clock (start to finish) and checks the submitted path, so a time
-- can only be recorded for a real solution. One ranked attempt per student per day.

create table public.chrono_puzzles (
  day_index integer primary key check (day_index >= 0),
  grid_size smallint not null check (grid_size between 4 and 9),
  checkpoints smallint[] not null check (cardinality(checkpoints) >= 2)
);

create table public.chrono_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  play_day date not null,
  day_index integer not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  mistakes integer not null default 0 check (mistakes between 0 and 99),
  duration_ms integer check (duration_ms >= 0),
  unique (user_id, play_day)
);
create index chrono_runs_board_idx on public.chrono_runs(play_day, duration_ms) where finished_at is not null;

alter table public.chrono_puzzles enable row level security;
alter table public.chrono_runs enable row level security;
-- Puzzles are public game data. Runs are read through the functions below; owners can see their own.
create policy chrono_puzzles_read on public.chrono_puzzles for select to anon, authenticated using (true);
create policy chrono_runs_owner on public.chrono_runs for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.chrono_puzzles, public.chrono_runs from anon, authenticated;
grant select on public.chrono_puzzles to anon, authenticated;
grant select on public.chrono_runs to authenticated;

-- The game day rolls over at midnight Malaysia time.
create or replace function private.chrono_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Kuala_Lumpur')::date $$;

-- Puzzle #1 is 2026-11-03; the seeded puzzles repeat in a cycle after that.
create or replace function private.chrono_day_index(d date) returns integer
language sql stable security definer set search_path = '' as $$
  select ((d - date '2026-11-03') % n + n) % n from (select count(*)::integer as n from public.chrono_puzzles) c where n > 0
$$;

-- Seconds added to a time for each event joined out of order.
create or replace function private.chrono_penalty_ms() returns integer language sql immutable set search_path = '' as $$ select 10000 $$;

-- True if `path` visits every cell once, moving one step up/down/left/right each time,
-- starts on the first checkpoint, ends on the last and meets the checkpoints in order.
create or replace function private.chrono_path_ok(n integer, checkpoints smallint[], path smallint[])
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare i integer; a integer; b integer; want integer := 1;
begin
  if path is null or cardinality(path) <> n * n then return false; end if;
  if (select count(distinct c) from unnest(path) c where c between 0 and n * n - 1) <> n * n then return false; end if;
  for i in 1 .. n * n loop
    if i > 1 then
      a := path[i - 1]; b := path[i];
      if abs(a % n - b % n) + abs(a / n - b / n) <> 1 then return false; end if;
    end if;
    if path[i] = any(checkpoints) then
      if path[i] <> checkpoints[want] then return false; end if;
      want := want + 1;
    end if;
  end loop;
  return want = cardinality(checkpoints) + 1 and path[1] = checkpoints[1] and path[n * n] = checkpoints[cardinality(checkpoints)];
end;
$$;

-- Starts (or resumes) today's ranked attempt. Starting again later keeps the original start
-- time, so reloading the page does not reset the clock.
create or replace function private.start_chrono()
returns table(run_id uuid, day_index integer, play_day date, started_at timestamptz, finished boolean, duration_ms integer, mistakes integer)
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid()); today date := private.chrono_today(); idx integer := private.chrono_day_index(private.chrono_today());
begin
  if me is null then raise exception 'Authentication required'; end if;
  if idx is null then raise exception 'No puzzle today'; end if;
  insert into public.chrono_runs(user_id, play_day, day_index) values (me, today, idx)
  on conflict on constraint chrono_runs_user_id_play_day_key do nothing;
  return query select r.id, r.day_index, r.play_day, r.started_at, r.finished_at is not null, r.duration_ms, r.mistakes
    from public.chrono_runs r where r.user_id = me and r.play_day = today;
end;
$$;

-- Records a solved path. The time is measured on the server from start_chrono, plus the
-- penalty for out-of-order joins reported by the game.
create or replace function private.finish_chrono(target_run uuid, path smallint[], wrong_joins integer)
returns table(duration_ms integer, mistakes integer, rank bigint, players bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid()); r public.chrono_runs%rowtype; p public.chrono_puzzles%rowtype; ms integer; m integer;
begin
  if me is null then raise exception 'Authentication required'; end if;
  select * into r from public.chrono_runs where id = target_run and user_id = me for update;
  if not found then raise exception 'Run not found'; end if;
  if r.finished_at is not null then raise exception 'Already finished'; end if;
  select * into p from public.chrono_puzzles where chrono_puzzles.day_index = r.day_index;
  if not private.chrono_path_ok(p.grid_size, p.checkpoints, path) then raise exception 'Path is not a solution'; end if;
  m := least(99, greatest(0, coalesce(wrong_joins, 0)));
  ms := least(2000000000, (extract(epoch from clock_timestamp() - r.started_at) * 1000)::bigint + m * private.chrono_penalty_ms())::integer;
  update public.chrono_runs set finished_at = clock_timestamp(), duration_ms = ms, mistakes = m where id = r.id;
  return query
    select ms, m,
      (select count(*) + 1 from public.chrono_runs o where o.play_day = r.play_day and o.finished_at is not null and o.id <> r.id and o.duration_ms < ms),
      (select count(*) from public.chrono_runs o where o.play_day = r.play_day and o.finished_at is not null);
end;
$$;

-- Fastest finished runs for a day (default today): top 10 of the students who allow
-- leaderboard display, plus the caller's own row. `players` counts every finisher.
create or replace function private.get_chrono_leaderboard(target_day date)
returns table(rank bigint, display_name text, school_name text, duration_ms integer, mistakes integer, is_me boolean, players bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid()); d date := coalesce(target_day, private.chrono_today());
begin
  if me is null then raise exception 'Authentication required'; end if;
  if d > private.chrono_today() or d < private.chrono_today() - 30 then raise exception 'Invalid day'; end if;
  return query
  with done as (
    select r.user_id, r.duration_ms, r.mistakes, r.finished_at,
      rank() over (order by r.duration_ms, r.finished_at) as place
    from public.chrono_runs r where r.play_day = d and r.finished_at is not null
  ), total as (select count(*) as n from done)
  select x.place, p.display_name, case when p.leaderboard_opt_in then p.school_name else '' end,
    x.duration_ms, x.mistakes, x.user_id = me, t.n
  from done x join public.profiles p on p.id = x.user_id cross join total t
  where (p.leaderboard_opt_in and x.place <= 10) or x.user_id = me
  order by x.place, x.finished_at;
end;
$$;

create or replace function public.start_chrono()
returns table(run_id uuid, day_index integer, play_day date, started_at timestamptz, finished boolean, duration_ms integer, mistakes integer)
language sql set search_path = '' as $$ select * from private.start_chrono(); $$;
create or replace function public.finish_chrono(target_run uuid, path smallint[], wrong_joins integer default 0)
returns table(duration_ms integer, mistakes integer, rank bigint, players bigint)
language sql set search_path = '' as $$ select * from private.finish_chrono(target_run, path, wrong_joins); $$;
create or replace function public.get_chrono_leaderboard(target_day date default null)
returns table(rank bigint, display_name text, school_name text, duration_ms integer, mistakes integer, is_me boolean, players bigint)
language sql stable set search_path = '' as $$ select * from private.get_chrono_leaderboard(target_day); $$;

revoke all on function private.chrono_today(), private.chrono_day_index(date), private.chrono_penalty_ms(),
  private.chrono_path_ok(integer, smallint[], smallint[]), private.start_chrono(),
  private.finish_chrono(uuid, smallint[], integer), private.get_chrono_leaderboard(date) from public, anon, authenticated;
grant execute on function private.chrono_today(), private.chrono_day_index(date), private.chrono_penalty_ms(),
  private.chrono_path_ok(integer, smallint[], smallint[]), private.start_chrono(),
  private.finish_chrono(uuid, smallint[], integer), private.get_chrono_leaderboard(date) to authenticated;
revoke all on function public.start_chrono(), public.finish_chrono(uuid, smallint[], integer),
  public.get_chrono_leaderboard(date) from public, anon, authenticated;
grant execute on function public.start_chrono(), public.finish_chrono(uuid, smallint[], integer),
  public.get_chrono_leaderboard(date) to authenticated;
