-- Personal study guide by textbook chapter, and a weekly board comparing classes in the same school.
-- Chapter tags on questions come from the reference-suggestion job (supabase/scripts/suggest_question_references.sql);
-- chapter-level tags are used here even before a page reference is verified.

create or replace function private.get_study_guide()
returns table(form_level integer, chapter_id integer, chapter_title text, page_start integer, answered bigint, correct bigint, accuracy integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Authentication required'; end if;
  return query
  with chapters as (
    select (regexp_replace(c.form, '\D', '', 'g'))::integer as form_level, c.chapter_id, min(c.chapter_title) as chapter_title, min(c.page_start) as page_start
    from public.rag_chunks c where c.chapter_id is not null
    group by 1, 2
  ), mine as (
    -- Only attempts whose answers are released, so the guide never leaks hidden correctness.
    select q.form_level, q.chapter_id, pa.is_correct
    from public.practice_attempts p
    join public.practice_answers pa on pa.attempt_id = p.id
    join public.questions q on q.id = pa.question_id
    where p.user_id = me and p.submitted_at is not null and q.chapter_id is not null and private.answers_released(p.id)
  )
  select ch.form_level, ch.chapter_id, ch.chapter_title, ch.page_start,
    count(m.is_correct), count(m.is_correct) filter (where m.is_correct),
    case when count(m.is_correct) = 0 then null else round(100.0 * count(m.is_correct) filter (where m.is_correct) / count(m.is_correct))::integer end
  from chapters ch
  left join mine m on m.form_level = ch.form_level and m.chapter_id = ch.chapter_id
  group by ch.form_level, ch.chapter_id, ch.chapter_title, ch.page_start
  order by ch.form_level, ch.chapter_id;
end;
$$;

-- Classes whose owners list the same school, ranked by this week's accuracy on class assignments.
create or replace function private.get_school_class_board(target_class uuid)
returns table(class_name text, form_level integer, members bigint, answered bigint, accuracy integer, is_mine boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare school text;
begin
  if not private.is_class_member(target_class) and not private.is_class_owner(target_class) then raise exception 'Class membership required'; end if;
  select nullif(trim(p.school_name), '') into school
  from public.study_classes c join public.profiles p on p.id = c.owner_id where c.id = target_class;
  return query
  select c.name, c.form_level::integer,
    (select count(*) from public.class_members m where m.class_id = c.id and m.role <> 'owner'),
    coalesce(sum(q.total), 0)::bigint,
    coalesce(round(100.0 * sum(q.score) / nullif(sum(q.total), 0)), 0)::integer,
    c.id = target_class
  from public.study_classes c
  join public.profiles o on o.id = c.owner_id
  left join public.class_assignments a on a.class_id = c.id
  left join public.quiz_results q on q.assignment_id = a.id and q.created_at >= date_trunc('week', now())
  where c.id = target_class or (school is not null and lower(trim(o.school_name)) = lower(school))
  group by c.id, c.name, c.form_level
  order by 5 desc, 4 desc, c.name
  limit 20;
end;
$$;

create or replace function public.get_study_guide()
returns table(form_level integer, chapter_id integer, chapter_title text, page_start integer, answered bigint, correct bigint, accuracy integer)
language sql stable set search_path = '' as $$ select * from private.get_study_guide(); $$;
create or replace function public.get_school_class_board(target_class uuid)
returns table(class_name text, form_level integer, members bigint, answered bigint, accuracy integer, is_mine boolean)
language sql stable set search_path = '' as $$ select * from private.get_school_class_board(target_class); $$;

revoke all on function private.get_study_guide(), private.get_school_class_board(uuid), public.get_study_guide(), public.get_school_class_board(uuid) from public, anon, authenticated;
grant execute on function private.get_study_guide(), private.get_school_class_board(uuid), public.get_study_guide(), public.get_school_class_board(uuid) to authenticated;
