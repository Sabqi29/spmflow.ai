-- Tests for 20261103010000_chrono_path (Laluan Masa). Run with scripts/test-db.sh.
\set ON_ERROR_STOP on
set client_min_messages = warning;
truncate auth.users cascade;
truncate public.chrono_puzzles;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test');
insert into public.profiles(id, display_name, school_name, form_level, leaderboard_opt_in) values
  ('00000000-0000-0000-0000-00000000000a', 'Aisyah', 'SMK A', 4, true),
  ('00000000-0000-0000-0000-00000000000b', 'Badrul', 'SMK B', 4, true),
  ('00000000-0000-0000-0000-00000000000c', 'Chong', 'SMK C', 4, false);
-- One 4x4 puzzle that every day maps to.
-- Snake path 0 1 2 3 7 6 5 4 8 9 10 11 15 14 13 12, checkpoints 0 -> 6 -> 9 -> 12.
insert into public.chrono_puzzles values (0, 4, '{0,6,9,12}');

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
begin perform set_config('request.jwt.claim.sub', who::text, false); end $$;

\set A '''00000000-0000-0000-0000-00000000000a'''
\set B '''00000000-0000-0000-0000-00000000000b'''
\set C '''00000000-0000-0000-0000-00000000000c'''
\set GOOD '''{0,1,2,3,7,6,5,4,8,9,10,11,15,14,13,12}'''
set client_min_messages = notice;

-- Path checker
select pg_temp.check(private.chrono_path_ok(4, '{0,6,9,12}', :GOOD), 'a full path in order is a solution');
select pg_temp.check(not private.chrono_path_ok(4, '{0,6,9,12}', '{0,1,2,3,7,6,5,4,8,9,10,11,15,14,13}'), 'a path that misses a cell is not');
select pg_temp.check(not private.chrono_path_ok(4, '{0,6,9,12}', '{0,1,2,3,7,6,5,4,8,9,10,11,15,14,12,13}'), 'a diagonal jump is not');
select pg_temp.check(not private.chrono_path_ok(4, '{0,6,9,12}', '{0,1,2,3,7,6,5,4,8,9,10,11,15,14,13,13}'), 'a repeated cell is not');
select pg_temp.check(not private.chrono_path_ok(4, '{0,9,6,12}', :GOOD), 'checkpoints out of order is not');
select pg_temp.check(not private.chrono_path_ok(4, '{1,6,9,12}', '{1,0,4,5,6,2,3,7,11,10,9,8,12,13,14,15}'), 'a path that does not end on the last checkpoint is not');
select pg_temp.check(not private.chrono_path_ok(4, '{0,6,9,12}', '{3,2,1,0,4,5,6,7,11,10,9,8,12,13,14,15}'), 'a path that does not start on the first checkpoint is not');
-- 3,2,1,0 wraps a row boundary check: 3 -> 4 is not adjacent on a 4-wide grid
select pg_temp.check(not private.chrono_path_ok(4, '{0,15}', '{0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15}'), 'wrapping from the end of one row to the next is not a step');

-- Access
select pg_temp.check(pg_temp.fails(null, 'select * from public.start_chrono()'), 'guests cannot start a ranked run');
select pg_temp.check(pg_temp.fails(null, 'select * from public.get_chrono_leaderboard()'), 'guests cannot read the leaderboard');
select pg_temp.check(not pg_temp.fails(null, 'select * from public.chrono_puzzles'), 'guests can read the puzzles');
select pg_temp.check(pg_temp.fails(:A, 'insert into public.chrono_runs(user_id, play_day, day_index) values (auth.uid(), current_date, 0)'), 'players cannot write runs directly');
select pg_temp.check(pg_temp.fails(:A, 'update public.chrono_runs set duration_ms = 1'), 'players cannot edit times directly');

-- A plays: start, resume keeps the clock, a wrong path is refused, the right one records a time.
select pg_temp.as_user(:A);
set role authenticated;
select run_id as run_a, started_at as start_a from public.start_chrono() \gset
reset role;
update public.chrono_runs set started_at = now() - interval '42 seconds' where id = :'run_a';
select pg_temp.as_user(:A);
set role authenticated;
select pg_temp.check((select started_at from public.start_chrono()) < now() - interval '40 seconds', 'starting again resumes the same run and clock');
select pg_temp.check((select count(*) from public.chrono_runs) = 1, 'a player sees only their own run');
reset role;
select pg_temp.check(pg_temp.fails(:A, format('select * from public.finish_chrono(%L, %L)', :'run_a', '{0,1,2,3,7,6,5,4,8,9,10,11,15,14,12,13}')), 'a wrong path is refused');
select pg_temp.check(pg_temp.fails(:B, format('select * from public.finish_chrono(%L, %L)', :'run_a', :GOOD)), 'another player cannot finish my run');
select pg_temp.as_user(:A);
set role authenticated;
select duration_ms as ms_a, rank as rank_a from public.finish_chrono(:'run_a', :GOOD, 1) \gset
reset role;
select pg_temp.check(:ms_a between 52000 and 60000, 'time is measured on the server, plus 10 s per wrong join');
select pg_temp.check(:rank_a = 1, 'first finisher is ranked first');
select pg_temp.check(pg_temp.fails(:A, format('select * from public.finish_chrono(%L, %L)', :'run_a', :GOOD)), 'a run cannot be finished twice');
select pg_temp.as_user(:A);
set role authenticated;
select pg_temp.check((select finished and duration_ms = :ms_a from public.start_chrono()), 'after finishing, today''s run stays finished');
reset role;

-- B and C finish faster.
select pg_temp.as_user(:B);
set role authenticated;
select run_id as run_b from public.start_chrono() \gset
select pg_temp.check((select rank from public.finish_chrono(:'run_b', :GOOD)) = 1, 'a faster time takes first place');
reset role;
select pg_temp.as_user(:C);
set role authenticated;
select run_id as run_c from public.start_chrono() \gset
select * from public.finish_chrono(:'run_c', :GOOD) \gset
reset role;

-- Leaderboard
select pg_temp.as_user(:A);
set role authenticated;
select pg_temp.check((select array_agg(display_name order by rank) from public.get_chrono_leaderboard()) = '{Badrul,Aisyah}', 'opted-out players are hidden from others');
select pg_temp.check((select players from public.get_chrono_leaderboard() limit 1) = 3, 'player count includes everyone who finished');
select pg_temp.check((select rank from public.get_chrono_leaderboard() where is_me) = 3, 'ranks count hidden players too');
reset role;
select pg_temp.as_user(:C);
set role authenticated;
select pg_temp.check((select count(*) from public.get_chrono_leaderboard() where is_me and school_name = '') = 1, 'an opted-out player sees their own row without school');
select pg_temp.check(pg_temp.fails(:C, 'select * from public.get_chrono_leaderboard(current_date + 5)'), 'future days are refused');
reset role;
