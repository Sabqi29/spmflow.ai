-- Server-side question bank and practice grading.
-- Answers live only in the database: clients can read stems and options but never the
-- `answer` column. Attempts are graded by security-definer functions that also write
-- quiz_results. Direct client score writes are closed in 20261028120100 (apply after deploy).

create table public.question_sets (
  id text primary key,
  year integer not null,
  title text not null,
  paper text not null default 'K1',
  state text not null default '',
  question_count integer not null check (question_count > 0),
  source_url text not null default '',
  created_at timestamptz not null default now()
);

create table public.questions (
  id text primary key,
  set_id text not null references public.question_sets(id) on delete cascade,
  question_number integer not null,
  stem text not null,
  options jsonb not null,
  answer text not null check (answer in ('A','B','C','D')),
  form_level smallint check (form_level in (4,5)),
  chapter_id integer,
  unique (set_id, question_number)
);
create index questions_set_idx on public.questions(set_id, question_number);

-- Teacher controls for assignments: how the set is taken and when answers are revealed.
alter table public.class_assignments
  add column mode text not null default 'locked' check (mode in ('locked','open')),
  add column release_policy text not null default 'after_due' check (release_policy in ('immediate','after_due','manual','never')),
  add column released_at timestamptz;

create table public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  set_id text not null references public.question_sets(id),
  assignment_id uuid references public.class_assignments(id) on delete set null,
  mode text not null default 'locked' check (mode in ('locked','open')),
  timer_seconds integer check (timer_seconds is null or timer_seconds between 60 and 14400),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score integer,
  total integer,
  duration_seconds integer
);
create index practice_attempts_user_idx on public.practice_attempts(user_id, started_at desc);
create index practice_attempts_assignment_idx on public.practice_attempts(assignment_id) where assignment_id is not null;

create table public.practice_answers (
  attempt_id uuid not null references public.practice_attempts(id) on delete cascade,
  question_id text not null references public.questions(id),
  choice text check (choice in ('A','B','C','D')),
  is_correct boolean not null,
  primary key (attempt_id, question_id)
);

alter table public.question_sets enable row level security;
alter table public.questions enable row level security;
alter table public.practice_attempts enable row level security;
alter table public.practice_answers enable row level security;

create policy question_sets_read on public.question_sets for select to anon, authenticated using (true);
create policy questions_read on public.questions for select to anon, authenticated using (true);
create policy practice_attempts_owner on public.practice_attempts for select to authenticated using ((select auth.uid()) = user_id);
-- practice_answers has no client policy: per-question correctness is only served through
-- get_practice_review, which applies the assignment's answer-release setting.

revoke all on public.question_sets, public.questions, public.practice_attempts, public.practice_answers from anon, authenticated;
grant select on public.question_sets to anon, authenticated;
grant select (id, set_id, question_number, stem, options, form_level, chapter_id) on public.questions to anon, authenticated;
grant select on public.practice_attempts to authenticated;

-- True once the student may see correct answers and explanations for this attempt.
create or replace function private.answers_released(target_attempt uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when p.submitted_at is null then false
      when a.id is null then true
      when a.release_policy = 'immediate' then true
      when a.release_policy = 'after_due' then a.due_at is null or now() >= a.due_at
      when a.release_policy = 'manual' then a.released_at is not null
      else false
    end
    from public.practice_attempts p
    left join public.class_assignments a on a.id = p.assignment_id
    where p.id = target_attempt
  ), false);
$$;

create or replace function private.start_practice(target_set text, target_assignment uuid, requested_mode text, requested_timer integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid()); a public.class_assignments%rowtype; attempt uuid; chosen_mode text := coalesce(requested_mode, 'locked');
begin
  if me is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.question_sets where id = target_set) then raise exception 'Question set not found'; end if;
  if chosen_mode not in ('locked','open') then raise exception 'Invalid mode'; end if;
  if target_assignment is not null then
    select * into a from public.class_assignments where id = target_assignment;
    if not found or not (private.is_class_member(a.class_id) or private.is_class_owner(a.class_id)) then raise exception 'Class membership required'; end if;
    if a.question_set_id <> target_set then raise exception 'Assignment does not use this set'; end if;
    chosen_mode := a.mode;
  end if;
  insert into public.practice_attempts(user_id, set_id, assignment_id, mode, timer_seconds)
  values (me, target_set, target_assignment, chosen_mode, requested_timer)
  returning id into attempt;
  return attempt;
end;
$$;

create or replace function private.submit_practice(target_attempt uuid, picks jsonb)
returns table(score integer, total integer, released boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid()); p public.practice_attempts%rowtype; got integer; n integer; form integer;
begin
  if me is null then raise exception 'Authentication required'; end if;
  select * into p from public.practice_attempts where id = target_attempt and user_id = me for update;
  if not found then raise exception 'Attempt not found'; end if;
  if p.submitted_at is not null then raise exception 'Attempt already submitted'; end if;
  if jsonb_typeof(coalesce(picks, '{}'::jsonb)) <> 'object' then raise exception 'Answers must be an object'; end if;

  insert into public.practice_answers(attempt_id, question_id, choice, is_correct)
  select p.id, q.id, c.choice, c.choice is not null and c.choice = q.answer
  from public.questions q
  left join lateral (
    select case when picks ->> q.id in ('A','B','C','D') then picks ->> q.id end as choice
  ) c on true
  where q.set_id = p.set_id;

  select count(*) filter (where is_correct), count(*) into got, n from public.practice_answers where attempt_id = p.id;
  update public.practice_attempts
  set submitted_at = now(), score = got, total = n,
      duration_seconds = greatest(0, extract(epoch from now() - p.started_at))::integer
  where id = p.id;

  select coalesce(sc.form_level, pr.form_level, 5) into form
  from (select 1) x
  left join public.class_assignments ca on ca.id = p.assignment_id
  left join public.study_classes sc on sc.id = ca.class_id
  left join public.profiles pr on pr.id = me;

  insert into public.quiz_results(user_id, form_level, score, total, assignment_id, question_set_id, duration_seconds, timer_seconds)
  values (me, form, got, n, p.assignment_id, p.set_id, greatest(0, extract(epoch from now() - p.started_at))::integer, p.timer_seconds);

  return query select got, n, private.answers_released(p.id);
end;
$$;

create or replace function private.get_practice_review(target_attempt uuid)
returns table(question_id text, question_number integer, stem text, options jsonb, choice text, is_correct boolean, answer text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid()); open boolean;
begin
  if me is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.practice_attempts where id = target_attempt and user_id = me and submitted_at is not null) then raise exception 'Attempt not found'; end if;
  open := private.answers_released(target_attempt);
  return query
  select q.id, q.question_number, q.stem, q.options, pa.choice,
    case when open then pa.is_correct end,
    case when open then q.answer end
  from public.practice_answers pa join public.questions q on q.id = pa.question_id
  where pa.attempt_id = target_attempt
  order by q.question_number;
end;
$$;

-- Guests may still practise a full set and see answers afterwards; nothing is stored.
create or replace function private.grade_guest_practice(target_set text, picks jsonb)
returns table(question_id text, choice text, answer text, is_correct boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, c.choice, q.answer, c.choice is not null and c.choice = q.answer
  from public.questions q
  left join lateral (
    select case when picks ->> q.id in ('A','B','C','D') then picks ->> q.id end as choice
  ) c on true
  where q.set_id = target_set
  order by q.question_number;
$$;

create or replace function public.start_practice(target_set text, target_assignment uuid default null, requested_mode text default 'locked', requested_timer integer default null)
returns uuid language sql set search_path = '' as $$ select private.start_practice(target_set, target_assignment, requested_mode, requested_timer); $$;
create or replace function public.submit_practice(target_attempt uuid, picks jsonb)
returns table(score integer, total integer, released boolean) language sql set search_path = '' as $$ select * from private.submit_practice(target_attempt, picks); $$;
create or replace function public.get_practice_review(target_attempt uuid)
returns table(question_id text, question_number integer, stem text, options jsonb, choice text, is_correct boolean, answer text) language sql stable set search_path = '' as $$ select * from private.get_practice_review(target_attempt); $$;
create or replace function public.grade_guest_practice(target_set text, picks jsonb)
returns table(question_id text, choice text, answer text, is_correct boolean) language sql stable set search_path = '' as $$ select * from private.grade_guest_practice(target_set, picks); $$;

revoke all on function private.answers_released(uuid), private.start_practice(text, uuid, text, integer), private.submit_practice(uuid, jsonb), private.get_practice_review(uuid), private.grade_guest_practice(text, jsonb) from public, anon, authenticated;
grant execute on function private.answers_released(uuid), private.start_practice(text, uuid, text, integer), private.submit_practice(uuid, jsonb), private.get_practice_review(uuid) to authenticated;
grant execute on function private.grade_guest_practice(text, jsonb) to anon, authenticated;
revoke all on function public.start_practice(text, uuid, text, integer), public.submit_practice(uuid, jsonb), public.get_practice_review(uuid), public.grade_guest_practice(text, jsonb) from public, anon, authenticated;
grant execute on function public.start_practice(text, uuid, text, integer), public.submit_practice(uuid, jsonb), public.get_practice_review(uuid) to authenticated;
grant execute on function public.grade_guest_practice(text, jsonb) to anon, authenticated;
