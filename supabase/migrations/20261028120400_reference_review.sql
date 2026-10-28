-- Review queue for AI-suggested textbook references. Only site admins (listed in private.app_admins,
-- added by hand in the SQL editor) can see unverified suggestions, verify, correct or reject them.
-- Verifying a reference also fixes the question's chapter tag used by the study guide.

create table private.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on private.app_admins from public, anon, authenticated;

create or replace function private.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from private.app_admins a where a.user_id = (select auth.uid())); $$;

create or replace function private.get_reference_queue(only_pending boolean default true, max_rows integer default 20)
returns table(reference_id uuid, question_id text, set_id text, question_number integer, stem text, options jsonb, answer text,
  form_level integer, chapter_id integer, chapter_title text, printed_page integer, section_title text, confidence real,
  mapping_source text, verified boolean, pending bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_app_admin() then raise exception 'Admin access required'; end if;
  return query
  select r.id, q.id, q.set_id, q.question_number, q.stem, q.options, q.answer,
    case r.textbook_id when 'sejarah-t5' then 5 else 4 end, r.chapter_id,
    (select min(c.chapter_title) from public.rag_chunks c where c.chapter_id = r.chapter_id
       and (regexp_replace(c.form, '\D', '', 'g'))::integer = case r.textbook_id when 'sejarah-t5' then 5 else 4 end),
    r.printed_page, r.section_title, r.confidence, r.mapping_source, r.verified,
    (select count(*) from public.question_references p where not p.verified)
  from public.question_references r
  join public.questions q on q.id = r.question_id
  where not only_pending or not r.verified
  -- Most confident suggestions first: they are the quickest to confirm.
  order by r.verified, r.confidence desc nulls last, q.set_id, q.question_number
  limit least(greatest(coalesce(max_rows, 20), 1), 100);
end;
$$;

-- decision: 'verify' (optionally with a corrected form, chapter and page) or 'reject'.
create or replace function private.review_reference(target_reference uuid, decision text,
  new_form integer default null, new_chapter integer default null, new_page integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare ref public.question_references;
declare chosen_form integer;
declare corrected boolean := new_form is not null or new_chapter is not null or new_page is not null;
begin
  if not private.is_app_admin() then raise exception 'Admin access required'; end if;
  select * into ref from public.question_references where id = target_reference for update;
  if not found then raise exception 'Reference not found'; end if;

  if decision = 'reject' then
    delete from public.question_references where id = target_reference;
    update public.questions set chapter_id = null, form_level = null where id = ref.question_id
      and not exists (select 1 from public.question_references r where r.question_id = ref.question_id and r.verified);
    return;
  end if;
  if decision <> 'verify' then raise exception 'Unknown decision'; end if;

  chosen_form := coalesce(new_form, case ref.textbook_id when 'sejarah-t5' then 5 else 4 end);
  if chosen_form not in (4, 5) then raise exception 'Form must be 4 or 5'; end if;
  if new_page is not null and new_page <= 0 then raise exception 'Page must be positive'; end if;
  if new_chapter is not null and not exists (select 1 from public.rag_chunks c where c.chapter_id = new_chapter
      and (regexp_replace(c.form, '\D', '', 'g'))::integer = chosen_form) then
    raise exception 'Unknown chapter for this form';
  end if;

  update public.question_references set
    textbook_id = 'sejarah-t' || chosen_form,
    chapter_id = coalesce(new_chapter, ref.chapter_id),
    printed_page = coalesce(new_page, ref.printed_page),
    rag_chunk_id = case when corrected then null else ref.rag_chunk_id end,
    section_title = case when corrected then '' else ref.section_title end,
    mapping_source = case when corrected then 'admin' else ref.mapping_source end,
    confidence = case when corrected then 1 else ref.confidence end,
    verified = true, verified_by = (select auth.uid()), verified_at = now()
  where id = target_reference;
  update public.questions set form_level = chosen_form, chapter_id = coalesce(new_chapter, ref.chapter_id)
  where id = ref.question_id;
end;
$$;

create or replace function public.is_app_admin()
returns boolean language sql stable set search_path = '' as $$ select private.is_app_admin(); $$;
create or replace function public.get_reference_queue(only_pending boolean default true, max_rows integer default 20)
returns table(reference_id uuid, question_id text, set_id text, question_number integer, stem text, options jsonb, answer text,
  form_level integer, chapter_id integer, chapter_title text, printed_page integer, section_title text, confidence real,
  mapping_source text, verified boolean, pending bigint)
language sql stable set search_path = '' as $$ select * from private.get_reference_queue(only_pending, max_rows); $$;
create or replace function public.review_reference(target_reference uuid, decision text,
  new_form integer default null, new_chapter integer default null, new_page integer default null)
returns void language sql set search_path = '' as $$ select private.review_reference(target_reference, decision, new_form, new_chapter, new_page); $$;

revoke all on function private.is_app_admin(), private.get_reference_queue(boolean, integer), private.review_reference(uuid, text, integer, integer, integer),
  public.is_app_admin(), public.get_reference_queue(boolean, integer), public.review_reference(uuid, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function private.is_app_admin(), private.get_reference_queue(boolean, integer), private.review_reference(uuid, text, integer, integer, integer),
  public.is_app_admin(), public.get_reference_queue(boolean, integer), public.review_reference(uuid, text, integer, integer, integer)
  to authenticated;
