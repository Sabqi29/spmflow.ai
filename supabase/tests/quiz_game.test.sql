-- Tests for 20261029210000_quiz_game. Run with scripts/test-db.sh.
\set ON_ERROR_STOP on
set client_min_messages = warning;
truncate auth.users cascade;
truncate public.questions, public.question_sets cascade;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test');
insert into public.profiles(id, display_name, school_name, form_level, leaderboard_opt_in) values
  ('00000000-0000-0000-0000-00000000000a', 'Aisyah', 'SMK A', 4, true),
  ('00000000-0000-0000-0000-00000000000b', 'Badrul', 'SMK B', 4, true),
  ('00000000-0000-0000-0000-00000000000c', 'Chong', 'SMK C', 4, false);
insert into public.question_sets(id, year, title, question_count) values ('s', 2024, 'Set', 30);
-- 12 questions in T4 Bab 1 (answer A), 12 in T4 Bab 2 (answer B), 6 untagged (answer C).
insert into public.questions(id, set_id, question_number, stem, options, answer, form_level, chapter_id)
select 'q' || n, 's', n, 'Stem ' || n, '{"A":"a","B":"b","C":"c","D":"d"}',
  case when n <= 12 then 'A' when n <= 24 then 'B' else 'C' end,
  case when n <= 24 then 4 end, case when n <= 12 then 1 when n <= 24 then 2 end
from generate_series(1, 30) n;

create function pg_temp.fails(who uuid, sql text) returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(who::text, ''), true);
  execute format('set local role %s', case when who is null then 'anon' else 'authenticated' end);
  begin execute sql; exception when others then reset role; return true; end;
  reset role; return false;
end $$;
create function pg_temp.check(ok boolean, name text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', name; end if; raise notice 'ok - %', name; end $$;
-- Plays a whole game as `who` in the given category, answering `n_right` questions correctly.
create function pg_temp.play(who uuid, f integer, c integer, n_right integer) returns uuid language plpgsql as $$
declare g uuid; qid text; ans text; i integer := 1; r record;
begin
  perform set_config('request.jwt.claim.sub', who::text, true);
  set local role authenticated;
  select s.game_id, s.question_id into g, qid from public.start_quiz_game(f, c) s;
  loop
    reset role;
    select answer into ans from public.questions where id = qid;
    set local role authenticated;
    select * into r from public.answer_quiz_game(g, case when i <= n_right then ans else (case when ans = 'D' then 'A' else 'D' end) end);
    exit when r.finished;
    select n.question_id into qid from public.next_quiz_question(g) n;
    i := i + 1;
  end loop;
  reset role;
  return g;
end $$;

\set A '''00000000-0000-0000-0000-00000000000a'''
\set B '''00000000-0000-0000-0000-00000000000b'''
\set C '''00000000-0000-0000-0000-00000000000c'''
set client_min_messages = notice;

-- Access
select pg_temp.check(pg_temp.fails(null, 'select * from public.start_quiz_game(4, 1)'), 'guests cannot start a ranked game');
select pg_temp.check(pg_temp.fails(null, 'select * from public.get_quiz_leaderboard()'), 'guests cannot read the leaderboard');
select pg_temp.check(pg_temp.fails(:A, 'select * from public.quiz_game_answers'), 'players cannot read stored answers directly');
select pg_temp.check(pg_temp.fails(:A, $$insert into public.quiz_games(user_id, question_ids, score) values ('00000000-0000-0000-0000-00000000000a', '{q1}', 10)$$), 'players cannot insert games directly');
select pg_temp.check(pg_temp.fails(:A, $$update public.quiz_games set duration_ms = 1$$), 'players cannot edit their times');
select pg_temp.check(pg_temp.fails(:A, 'select * from public.start_quiz_game(null, 1)'), 'a chapter needs a form');
select pg_temp.check(pg_temp.fails(:A, 'select * from public.start_quiz_game(4, 11)'), 'chapter must exist');
select pg_temp.check(pg_temp.fails(:A, 'select * from public.start_quiz_game(5, 1)'), 'empty pool is refused');

-- Pools
select pg_temp.check((select count(*) = 10 and bool_and(id::text ~ '^q([1-9]|1[0-2])$') from (select q.id from public.pick_guest_quiz(4, 1) q(id, stem, options)) x), 'guest picks 10 questions from the chosen chapter');
select pg_temp.check((select count(*) = 10 from public.pick_guest_quiz()), 'random mode picks 10 from the whole bank');
select pg_temp.check((select is_correct and answer = 'A' from public.check_guest_quiz('q1', 'A')), 'guest check grades an answer');

-- Game flow
do $$
declare g uuid; first text; r record;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
  set local role authenticated;
  select s.game_id, s.question_id into g, first from public.start_quiz_game(4, 2) s;
  begin perform public.next_quiz_question(g); raise exception 'skipped ahead'; exception when others then if sqlerrm = 'skipped ahead' then raise; end if; end;
  select * into r from public.answer_quiz_game(g, 'B');
  if not (r.is_correct and r.answer = 'B' and r.score = 1 and r.total = 10 and not r.finished) then raise exception 'FAILED: first answer graded'; end if;
  begin perform public.answer_quiz_game(g, 'B'); raise exception 'answered twice'; exception when others then if sqlerrm = 'answered twice' then raise; end if; end;
  reset role;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
  set local role authenticated;
  begin perform public.answer_quiz_game(g, 'B'); raise exception 'stole game'; exception when others then if sqlerrm = 'stole game' then raise; end if; end;
  reset role;
  raise notice 'ok - game flow: no skipping ahead, no double answers, no playing others'' games';
end $$;

-- Late answers are wrong even if the choice matches.
do $$
declare g uuid; r record;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
  set local role authenticated;
  select s.game_id into g from public.start_quiz_game(4, 1) s;
  reset role;
  update public.quiz_games set served_at = now() - interval '40 seconds' where id = g;
  set local role authenticated;
  select * into r from public.answer_quiz_game(g, 'A');
  reset role;
  if r.is_correct or r.duration_ms <> 23000 then raise exception 'FAILED: late answer counted (%, %)', r.is_correct, r.duration_ms; end if;
  raise notice 'ok - late answers count as wrong and time is capped';
end $$;

-- Leaderboard: all correct first, then fastest; best game per player; opt-in respected.
do $$
declare ga uuid; gb uuid; gb2 uuid; gc uuid;
begin
  ga := pg_temp.play('00000000-0000-0000-0000-00000000000a', 4, 1, 10);
  gb := pg_temp.play('00000000-0000-0000-0000-00000000000b', 4, 1, 10);
  gb2 := pg_temp.play('00000000-0000-0000-0000-00000000000b', 4, 1, 7);
  gc := pg_temp.play('00000000-0000-0000-0000-00000000000c', 4, 1, 10);
  update public.quiz_games set duration_ms = 60000 where id = ga;
  update public.quiz_games set duration_ms = 30000 where id = gb;
  update public.quiz_games set duration_ms = 5000 where id = gb2;
  update public.quiz_games set duration_ms = 10000 where id = gc;
end $$;

select set_config('request.jwt.claim.sub', :A, false);
select pg_temp.check((select array_agg(display_name order by rank) = '{Badrul,Aisyah}' from public.get_quiz_leaderboard(4, 1, 'week')), 'faster perfect run ranks first; fast imperfect run does not beat it');
select pg_temp.check((select count(*) = 2 from public.get_quiz_leaderboard(4, 1, 'all')), 'one row per player, non-opted-in player hidden');
select pg_temp.check((select count(*) = 0 from public.get_quiz_leaderboard(4, 2, 'week')), 'unfinished games do not appear; categories are separate');
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
  set local role authenticated;
  if not exists (select 1 from public.get_quiz_leaderboard(4, 1, 'week') where is_me and rank = 1 and display_name = 'Chong' and school_name = '') then
    raise exception 'FAILED: own best shown to self';
  end if;
  reset role;
  raise notice 'ok - a player who did not opt in still sees their own rank, without their school';
end $$;
select pg_temp.check((select count(*) = 1 from public.quiz_game_answers a join public.quiz_games g on g.id = a.game_id where g.user_id = '00000000-0000-0000-0000-00000000000a' and g.chapter_id = 2), 'answers are stored per question');
