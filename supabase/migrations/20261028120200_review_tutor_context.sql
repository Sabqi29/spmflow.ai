-- Quiz review: textbook references per question, tutor chats linked to a reviewed question,
-- server-side rules for when the AI tutor may help, and aggregate-only teacher insights.

-- Where in the textbook a question is covered. Only verified rows are shown to students;
-- unverified mappings stay hidden and the app shows "Rujukan sedang disemak".
create table public.question_references (
  id uuid primary key default gen_random_uuid(),
  question_id text not null references public.questions(id) on delete cascade,
  textbook_id text references public.textbooks(id),
  rag_chunk_id text references public.rag_chunks(id) on delete set null,
  chapter_id integer,
  printed_page integer check (printed_page is null or printed_page > 0),
  section_title text not null default '',
  confidence real check (confidence is null or confidence between 0 and 1),
  mapping_source text not null default 'ai' check (mapping_source in ('ai','teacher','admin')),
  verified boolean not null default false,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index question_references_question_idx on public.question_references(question_id) where verified;

alter table public.question_references enable row level security;
create policy question_references_verified on public.question_references for select to anon, authenticated using (verified);
revoke all on public.question_references from anon, authenticated;
grant select on public.question_references to anon, authenticated;

-- A tutor chat can be opened from a reviewed question.
alter table public.chat_sessions
  add column attempt_id uuid references public.practice_attempts(id) on delete set null,
  add column question_id text references public.questions(id) on delete set null;
create index chat_sessions_attempt_idx on public.chat_sessions(attempt_id) where attempt_id is not null;

create or replace function private.check_chat_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.attempt_id is null then
    new.question_id := null;
    return new;
  end if;
  if not exists (
    select 1 from public.practice_attempts p
    join public.questions q on q.set_id = p.set_id and q.id = new.question_id
    where p.id = new.attempt_id and p.user_id = new.user_id
  ) then
    raise exception 'Chat context must be a question from your own attempt';
  end if;
  return new;
end;
$$;
create trigger check_chat_context before insert or update of attempt_id, question_id on public.chat_sessions
for each row execute function private.check_chat_context();

-- Textbook reference opens, for aggregate teacher insights only.
create table public.study_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('reference_open','review_ask_ai')),
  attempt_id uuid references public.practice_attempts(id) on delete cascade,
  question_id text references public.questions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index study_events_attempt_idx on public.study_events(attempt_id);
alter table public.study_events enable row level security;
revoke all on public.study_events from anon, authenticated;

-- An unsubmitted Locked In attempt that is still within its time blocks the AI tutor.
create or replace function private.locked_in_active(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.practice_attempts
    where user_id = target_user and mode = 'locked' and submitted_at is null
      and started_at > now() - make_interval(secs => coalesce(timer_seconds, 7200) + 300)
  );
$$;

create or replace function private.abandon_practice(target_attempt uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.practice_attempts
  where id = target_attempt and user_id = (select auth.uid()) and submitted_at is null;
$$;

create or replace function private.log_study_event(event_kind text, target_attempt uuid, target_question text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.practice_attempts where id = target_attempt and user_id = (select auth.uid()) and submitted_at is not null) then
    raise exception 'Attempt not found';
  end if;
  insert into public.study_events(user_id, kind, attempt_id, question_id) values ((select auth.uid()), event_kind, target_attempt, target_question);
end;
$$;

-- What the tutor endpoint may use for a question opened from review. Service role only:
-- the edge function verifies the user's token and passes their id.
create or replace function private.tutor_question_context(target_user uuid, target_attempt uuid, target_question text)
returns table(stem text, options jsonb, choice text, answer text, submitted boolean, released boolean, mode text, form_level integer)
language sql
stable
security definer
set search_path = ''
as $$
  select q.stem,
    case when private.answers_released(p.id) then q.options end,
    pa.choice,
    case when private.answers_released(p.id) then q.answer end,
    p.submitted_at is not null,
    private.answers_released(p.id),
    p.mode,
    coalesce(q.form_level, sc.form_level::integer)
  from public.practice_attempts p
  join public.questions q on q.set_id = p.set_id and q.id = target_question
  left join public.practice_answers pa on pa.attempt_id = p.id and pa.question_id = q.id
  left join public.class_assignments ca on ca.id = p.assignment_id
  left join public.study_classes sc on sc.id = ca.class_id
  where p.id = target_attempt and p.user_id = target_user;
$$;

-- Class-wide help-seeking numbers for the assignment's teacher. Never returns chat text.
create or replace function private.get_assignment_insights(target_assignment uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare a public.class_assignments%rowtype; result jsonb;
begin
  select * into a from public.class_assignments where id = target_assignment;
  if not found or not private.is_class_owner(a.class_id) then raise exception 'Class owner required'; end if;
  with attempts as (
    select id, user_id from public.practice_attempts where assignment_id = a.id and submitted_at is not null
  ), chats as (
    select s.user_id, s.question_id from public.chat_sessions s join attempts t on t.id = s.attempt_id
  ), refs as (
    select e.question_id from public.study_events e join attempts t on t.id = e.attempt_id where e.kind = 'reference_open'
  )
  select jsonb_build_object(
    'students', (select count(*) from public.class_members where class_id = a.class_id and role <> 'owner'),
    'submitted', (select count(distinct user_id) from attempts),
    'asked_ai', (select count(distinct user_id) from chats),
    'reference_opens', (select count(*) from refs),
    'average_score', (select round(avg(100.0 * score / nullif(total, 0))) from public.practice_attempts where assignment_id = a.id and submitted_at is not null),
    'top_questions', coalesce((
      select jsonb_agg(x order by x.asks desc, x.question_number) from (
        select q.id, q.question_number, left(q.stem, 140) as stem, count(*) as asks
        from chats c join public.questions q on q.id = c.question_id
        group by q.id, q.question_number, q.stem order by count(*) desc, q.question_number limit 5
      ) x), '[]'::jsonb),
    'most_missed', coalesce((
      select jsonb_agg(x order by x.wrong desc, x.question_number) from (
        select q.id, q.question_number, left(q.stem, 140) as stem, count(*) filter (where not pa.is_correct) as wrong, count(*) as answered
        from attempts t join public.practice_answers pa on pa.attempt_id = t.id join public.questions q on q.id = pa.question_id
        group by q.id, q.question_number, q.stem order by count(*) filter (where not pa.is_correct) desc, q.question_number limit 5
      ) x), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.abandon_practice(target_attempt uuid)
returns void language sql set search_path = '' as $$ select private.abandon_practice(target_attempt); $$;
create or replace function public.log_study_event(event_kind text, target_attempt uuid, target_question text)
returns void language sql set search_path = '' as $$ select private.log_study_event(event_kind, target_attempt, target_question); $$;
create or replace function public.get_assignment_insights(target_assignment uuid)
returns jsonb language sql stable set search_path = '' as $$ select private.get_assignment_insights(target_assignment); $$;
create or replace function public.tutor_question_context(target_user uuid, target_attempt uuid, target_question text)
returns table(stem text, options jsonb, choice text, answer text, submitted boolean, released boolean, mode text, form_level integer)
language sql stable set search_path = '' as $$ select * from private.tutor_question_context(target_user, target_attempt, target_question); $$;
create or replace function public.tutor_locked_in(target_user uuid)
returns boolean language sql stable set search_path = '' as $$ select private.locked_in_active(target_user); $$;

revoke all on function private.check_chat_context(), private.locked_in_active(uuid), private.abandon_practice(uuid), private.log_study_event(text, uuid, text), private.tutor_question_context(uuid, uuid, text), private.get_assignment_insights(uuid) from public, anon, authenticated;
grant execute on function private.abandon_practice(uuid), private.log_study_event(text, uuid, text), private.get_assignment_insights(uuid) to authenticated;
grant usage on schema private to service_role;
grant execute on function private.locked_in_active(uuid), private.tutor_question_context(uuid, uuid, text), private.answers_released(uuid) to service_role;
revoke all on function public.abandon_practice(uuid), public.log_study_event(text, uuid, text), public.get_assignment_insights(uuid), public.tutor_question_context(uuid, uuid, text), public.tutor_locked_in(uuid) from public, anon, authenticated;
grant execute on function public.abandon_practice(uuid), public.log_study_event(text, uuid, text), public.get_assignment_insights(uuid) to authenticated;
grant execute on function public.tutor_question_context(uuid, uuid, text), public.tutor_locked_in(uuid) to service_role;
