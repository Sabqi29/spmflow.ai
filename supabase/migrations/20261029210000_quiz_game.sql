-- Kuiz Pantas: a timed 10-question game drawn from the question bank, with a leaderboard
-- ranked by score (all correct first) and then by total answering time.
-- Questions are served one at a time and graded on the server, so the answer key stays
-- hidden and the clock (time from serving a question to its answer) cannot be faked.
-- Guests can play through pick/check functions that store nothing and never rank.

create table public.quiz_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  form_level smallint check (form_level in (4,5)),
  chapter_id integer check (chapter_id between 1 and 10),
  question_ids text[] not null,
  position integer not null default 1,
  served_at timestamptz not null default now(),
  score integer not null default 0,
  duration_ms integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  check (chapter_id is null or form_level is not null)
);
create index quiz_games_user_idx on public.quiz_games(user_id, started_at desc);
create index quiz_games_board_idx on public.quiz_games(form_level, chapter_id, finished_at) where finished_at is not null;

create table public.quiz_game_answers (
  game_id uuid not null references public.quiz_games(id) on delete cascade,
  position integer not null,
  question_id text not null references public.questions(id),
  choice text check (choice in ('A','B','C','D')),
  is_correct boolean not null,
  response_ms integer not null,
  primary key (game_id, position)
);

alter table public.quiz_games enable row level security;
alter table public.quiz_game_answers enable row level security;
create policy quiz_games_owner on public.quiz_games for select to authenticated using ((select auth.uid()) = user_id);
-- quiz_game_answers has no client policy: results come back through answer_quiz_game.
revoke all on public.quiz_games, public.quiz_game_answers from anon, authenticated;
grant select on public.quiz_games to authenticated;

-- Seconds a player has per question, plus a little grace for the network round trip.
create or replace function private.quiz_time_limit_ms() returns integer language sql immutable set search_path = '' as $$ select 20000 + 3000 $$;

-- Up to `n` random question ids from the chosen pool (null form/chapter = any).
create or replace function private.quiz_pool(target_form integer, target_chapter integer, n integer)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare picked text[];
begin
  if target_form is not null and target_form not in (4,5) then raise exception 'Invalid form'; end if;
  if target_chapter is not null and (target_form is null or target_chapter not between 1 and 10) then raise exception 'Invalid chapter'; end if;
  select array_agg(id) into picked from (
    select q.id from public.questions q
    where (target_form is null or q.form_level = target_form)
      and (target_chapter is null or q.chapter_id = target_chapter)
    order by random() limit n
  ) x;
  if picked is null then raise exception 'No questions for this choice'; end if;
  return picked;
end;
$$;

create or replace function private.start_quiz_game(target_form integer, target_chapter integer)
returns table(game_id uuid, total integer, question_number integer, question_id text, stem text, options jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid()); picked text[]; g uuid;
begin
  if me is null then raise exception 'Authentication required'; end if;
  if (select count(*) from public.quiz_games where user_id = me and started_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many games started, try again later';
  end if;
  picked := private.quiz_pool(target_form, target_chapter, 10);
  insert into public.quiz_games(user_id, form_level, chapter_id, question_ids)
  values (me, target_form, target_chapter, picked)
  returning id into g;
  return query select g, cardinality(picked), 1, q.id, q.stem, q.options from public.questions q where q.id = picked[1];
end;
$$;

-- Grades the current question. Late answers (past the time limit) count as wrong.
create or replace function private.answer_quiz_game(target_game uuid, picked text)
returns table(is_correct boolean, answer text, score integer, total integer, duration_ms integer, finished boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid()); g public.quiz_games%rowtype; q public.questions%rowtype; ms integer; ok boolean; pick text;
begin
  if me is null then raise exception 'Authentication required'; end if;
  select * into g from public.quiz_games where id = target_game and user_id = me for update;
  if not found then raise exception 'Game not found'; end if;
  if g.finished_at is not null then raise exception 'Game already finished'; end if;
  if exists (select 1 from public.quiz_game_answers a where a.game_id = g.id and a.position = g.position) then
    raise exception 'Question already answered';
  end if;
  select * into q from public.questions where id = g.question_ids[g.position];
  pick := case when picked in ('A','B','C','D') then picked end;
  ms := least(private.quiz_time_limit_ms(), greatest(0, (extract(epoch from clock_timestamp() - g.served_at) * 1000)::integer));
  ok := pick is not null and pick = q.answer and ms < private.quiz_time_limit_ms();
  insert into public.quiz_game_answers(game_id, position, question_id, choice, is_correct, response_ms)
  values (g.id, g.position, q.id, pick, ok, ms);
  update public.quiz_games set
    score = g.score + ok::integer,
    duration_ms = g.duration_ms + ms,
    finished_at = case when g.position >= cardinality(g.question_ids) then now() end
  where id = g.id;
  return query select ok, q.answer, g.score + ok::integer, cardinality(g.question_ids), g.duration_ms + ms, g.position >= cardinality(g.question_ids);
end;
$$;

-- Serves the next question once the current one is answered; its clock starts now.
create or replace function private.next_quiz_question(target_game uuid)
returns table(question_number integer, question_id text, stem text, options jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid()); g public.quiz_games%rowtype;
begin
  if me is null then raise exception 'Authentication required'; end if;
  select * into g from public.quiz_games where id = target_game and user_id = me for update;
  if not found then raise exception 'Game not found'; end if;
  if g.finished_at is not null then raise exception 'Game already finished'; end if;
  if not exists (select 1 from public.quiz_game_answers a where a.game_id = g.id and a.position = g.position) then
    raise exception 'Answer the current question first';
  end if;
  update public.quiz_games set position = g.position + 1, served_at = clock_timestamp() where id = g.id;
  return query select g.position + 1, q.id, q.stem, q.options from public.questions q where q.id = g.question_ids[g.position + 1];
end;
$$;

-- Best game per player in this category: most correct, then fastest, then earliest.
-- Shows players who opted in to leaderboards, plus the caller's own best.
create or replace function private.get_quiz_leaderboard(target_form integer, target_chapter integer, period text)
returns table(rank bigint, display_name text, school_name text, score integer, total integer, duration_ms integer, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Authentication required'; end if;
  if period not in ('week','all') then raise exception 'Invalid period'; end if;
  return query
  with best as (
    select distinct on (g.user_id) g.user_id, g.score, cardinality(g.question_ids) as total, g.duration_ms, g.finished_at
    from public.quiz_games g
    where g.finished_at is not null
      and g.form_level is not distinct from target_form
      and g.chapter_id is not distinct from target_chapter
      and (period = 'all' or g.finished_at >= date_trunc('week', now()))
    order by g.user_id, g.score desc, g.duration_ms, g.finished_at
  ), ranked as (
    select b.*, row_number() over (order by b.score desc, b.duration_ms, b.finished_at) as place
    from best b join public.profiles p on p.id = b.user_id
    where p.leaderboard_opt_in or b.user_id = me
  )
  select r.place, p.display_name, case when p.leaderboard_opt_in then p.school_name else '' end,
    r.score, r.total::integer, r.duration_ms, r.user_id = me
  from ranked r join public.profiles p on p.id = r.user_id
  where r.place <= 10 or r.user_id = me
  order by r.place;
end;
$$;

-- Guest play: questions without answers, and one-question checks. Nothing is stored.
create or replace function private.pick_guest_quiz(target_form integer, target_chapter integer)
returns table(question_id text, stem text, options jsonb)
language sql
volatile
security definer
set search_path = ''
as $$
  select q.id, q.stem, q.options
  from unnest(private.quiz_pool(target_form, target_chapter, 10)) with ordinality as p(id, n)
  join public.questions q on q.id = p.id
  order by p.n;
$$;

create or replace function private.check_guest_quiz(target_question text, picked text)
returns table(is_correct boolean, answer text)
language sql
stable
security definer
set search_path = ''
as $$
  select picked is not null and picked = q.answer, q.answer from public.questions q where q.id = target_question;
$$;

create or replace function public.start_quiz_game(target_form integer default null, target_chapter integer default null)
returns table(game_id uuid, total integer, question_number integer, question_id text, stem text, options jsonb)
language sql set search_path = '' as $$ select * from private.start_quiz_game(target_form, target_chapter); $$;
create or replace function public.answer_quiz_game(target_game uuid, picked text)
returns table(is_correct boolean, answer text, score integer, total integer, duration_ms integer, finished boolean)
language sql set search_path = '' as $$ select * from private.answer_quiz_game(target_game, picked); $$;
create or replace function public.next_quiz_question(target_game uuid)
returns table(question_number integer, question_id text, stem text, options jsonb)
language sql set search_path = '' as $$ select * from private.next_quiz_question(target_game); $$;
create or replace function public.get_quiz_leaderboard(target_form integer default null, target_chapter integer default null, period text default 'week')
returns table(rank bigint, display_name text, school_name text, score integer, total integer, duration_ms integer, is_me boolean)
language sql stable set search_path = '' as $$ select * from private.get_quiz_leaderboard(target_form, target_chapter, period); $$;
create or replace function public.pick_guest_quiz(target_form integer default null, target_chapter integer default null)
returns table(question_id text, stem text, options jsonb)
language sql volatile set search_path = '' as $$ select * from private.pick_guest_quiz(target_form, target_chapter); $$;
create or replace function public.check_guest_quiz(target_question text, picked text)
returns table(is_correct boolean, answer text)
language sql stable set search_path = '' as $$ select * from private.check_guest_quiz(target_question, picked); $$;

revoke all on function private.quiz_time_limit_ms(), private.quiz_pool(integer, integer, integer),
  private.start_quiz_game(integer, integer), private.answer_quiz_game(uuid, text), private.next_quiz_question(uuid),
  private.get_quiz_leaderboard(integer, integer, text), private.pick_guest_quiz(integer, integer),
  private.check_guest_quiz(text, text) from public, anon, authenticated;
grant execute on function private.quiz_time_limit_ms(), private.quiz_pool(integer, integer, integer),
  private.pick_guest_quiz(integer, integer), private.check_guest_quiz(text, text) to anon, authenticated;
grant execute on function private.start_quiz_game(integer, integer), private.answer_quiz_game(uuid, text),
  private.next_quiz_question(uuid), private.get_quiz_leaderboard(integer, integer, text) to authenticated;
revoke all on function public.start_quiz_game(integer, integer), public.answer_quiz_game(uuid, text),
  public.next_quiz_question(uuid), public.get_quiz_leaderboard(integer, integer, text),
  public.pick_guest_quiz(integer, integer), public.check_guest_quiz(text, text) from public, anon, authenticated;
grant execute on function public.start_quiz_game(integer, integer), public.answer_quiz_game(uuid, text),
  public.next_quiz_question(uuid), public.get_quiz_leaderboard(integer, integer, text) to authenticated;
grant execute on function public.pick_guest_quiz(integer, integer), public.check_guest_quiz(text, text) to anon, authenticated;
