-- Practice by chapter ("Ikut bab").
-- Each Sejarah chapter becomes a virtual question set `bab-t<form>-<chapter>` so attempts,
-- quiz_results and the existing RPCs keep working. A chapter round is a random draw of
-- questions tagged with that form_level/chapter_id; the drawn ids are stored on the attempt
-- so grading only counts the questions the student was actually given.

alter table public.practice_attempts add column if not exists question_ids text[];

-- One row per chapter that has tagged questions (paper = 'BAB' keeps them out of paper lists).
insert into public.question_sets(id, year, title, paper, state, question_count, source_url)
select format('bab-t%s-%s', q.form_level, q.chapter_id), 0,
       format('Tingkatan %s · Bab %s', q.form_level, q.chapter_id), 'BAB', '', count(*),
       'https://github.com/khayyum04/studyflow_v2/blob/main/data/paper_1_dataset.json'
from public.questions q
where q.form_level in (4,5) and q.chapter_id is not null and q.set_id not like 'bab-%'
group by q.form_level, q.chapter_id
on conflict (id) do update set question_count = excluded.question_count;

-- Parses a chapter set id; returns no row for an ordinary paper set.
create or replace function private.chapter_of(target_set text)
returns table(form_level smallint, chapter_id integer) language sql immutable set search_path = '' as $$
  select m[1]::smallint, m[2]::integer
  from (select regexp_match(target_set, '^bab-t([45])-([0-9]{1,2})$') as m) x
  where m is not null;
$$;

drop function if exists public.start_practice(text, uuid, text, integer);
drop function if exists private.start_practice(text, uuid, text, integer);

create or replace function private.start_practice(target_set text, target_assignment uuid, requested_mode text, requested_timer integer, target_questions text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); a public.class_assignments%rowtype; attempt uuid; chosen_mode text := coalesce(requested_mode, 'locked');
  ch record; drawn text[];
begin
  if me is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.question_sets where id = target_set) then raise exception 'Question set not found'; end if;
  if chosen_mode not in ('locked','open') then raise exception 'Invalid mode'; end if;
  select * into ch from private.chapter_of(target_set);
  if found then
    select array_agg(distinct x) into drawn from unnest(coalesce(target_questions, '{}')) x;
    if coalesce(cardinality(drawn), 0) not between 1 and 60 then raise exception 'Choose between 1 and 60 questions'; end if;
    if (select count(*) from public.questions q where q.id = any(drawn) and q.form_level = ch.form_level and q.chapter_id = ch.chapter_id) <> cardinality(drawn)
      then raise exception 'Questions do not belong to this chapter'; end if;
  end if;
  if target_assignment is not null then
    select * into a from public.class_assignments where id = target_assignment;
    if not found or not (private.is_class_member(a.class_id) or private.is_class_owner(a.class_id)) then raise exception 'Class membership required'; end if;
    if a.question_set_id <> target_set then raise exception 'Assignment does not use this set'; end if;
    chosen_mode := a.mode;
  end if;
  insert into public.practice_attempts(user_id, set_id, assignment_id, mode, timer_seconds, question_ids)
  values (me, target_set, target_assignment, chosen_mode, requested_timer, drawn)
  returning id into attempt;
  return attempt;
end;
$$;

create or replace function private.submit_practice(target_attempt uuid, picks jsonb)
returns table(score integer, total integer, released boolean) language plpgsql security definer set search_path = '' as $$
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
  where case when p.question_ids is null then q.set_id = p.set_id else q.id = any(p.question_ids) end;

  select count(*) filter (where is_correct), count(*) into got, n from public.practice_answers where attempt_id = p.id;
  update public.practice_attempts
  set submitted_at = now(), score = got, total = n,
      duration_seconds = greatest(0, extract(epoch from now() - p.started_at))::integer
  where id = p.id;

  select coalesce(sc.form_level, ch.form_level, pr.form_level, 5) into form
  from (select 1) x
  left join public.class_assignments ca on ca.id = p.assignment_id
  left join public.study_classes sc on sc.id = ca.class_id
  left join private.chapter_of(p.set_id) ch on true
  left join public.profiles pr on pr.id = me;

  insert into public.quiz_results(user_id, form_level, score, total, assignment_id, question_set_id, duration_seconds, timer_seconds)
  values (me, form, got, n, p.assignment_id, p.set_id, greatest(0, extract(epoch from now() - p.started_at))::integer, p.timer_seconds);

  return query select got, n, private.answers_released(p.id);
end;
$$;

-- Guests: a chapter set grades only the question ids sent in picks (unanswered ones as null).
create or replace function private.grade_guest_practice(target_set text, picks jsonb)
returns table(question_id text, choice text, answer text, is_correct boolean) language sql stable security definer set search_path = '' as $$
  select q.id, c.choice, q.answer, c.choice is not null and c.choice = q.answer
  from public.questions q
  left join private.chapter_of(target_set) ch on true
  left join lateral (
    select case when picks ->> q.id in ('A','B','C','D') then picks ->> q.id end as choice
  ) c on true
  where case when ch.form_level is null then q.set_id = target_set
             else q.form_level = ch.form_level and q.chapter_id = ch.chapter_id and coalesce(picks, '{}'::jsonb) ? q.id end
  order by q.question_number;
$$;

create or replace function public.start_practice(target_set text, target_assignment uuid default null, requested_mode text default 'locked', requested_timer integer default null, target_questions text[] default null)
returns uuid language sql set search_path = '' as $$ select private.start_practice(target_set, target_assignment, requested_mode, requested_timer, target_questions); $$;

revoke all on function private.chapter_of(text), private.start_practice(text, uuid, text, integer, text[]) from public, anon, authenticated;
grant execute on function private.chapter_of(text) to anon, authenticated;
grant execute on function private.start_practice(text, uuid, text, integer, text[]) to authenticated;
revoke all on function public.start_practice(text, uuid, text, integer, text[]) from public, anon, authenticated;
grant execute on function public.start_practice(text, uuid, text, integer, text[]) to authenticated;
