create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.community_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  subject text not null default 'Sejarah' check (char_length(subject) <= 60),
  form_level smallint not null check (form_level in (4, 5)),
  chapter text not null check (char_length(chapter) between 1 and 120),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) <= 180),
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  contributor_name text not null default '' check (char_length(contributor_name) <= 60),
  school_name text not null default '' check (char_length(school_name) <= 120),
  status text not null default 'published' check (status in ('published', 'hidden')),
  vote_count integer not null default 0 check (vote_count >= 0),
  download_count integer not null default 0 check (download_count >= 0),
  created_at timestamptz not null default now()
);

create index community_notes_subject_chapter_idx
  on public.community_notes(subject, form_level, chapter, created_at desc);
alter table public.community_notes enable row level security;
create policy community_notes_read on public.community_notes for select to anon, authenticated
  using (status = 'published' or (select auth.uid()) = user_id);
create policy community_notes_insert on public.community_notes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy community_notes_delete on public.community_notes for delete to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.community_notes to anon, authenticated;
grant insert, delete on public.community_notes to authenticated;

create function private.set_note_credit() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  select coalesce(nullif(p.display_name, ''), 'Pelajar spmflow'), coalesce(p.school_name, '')
    into new.contributor_name, new.school_name
  from public.profiles p
  where p.id = new.user_id;
  if not found then
    new.contributor_name := 'Pelajar spmflow';
    new.school_name := '';
  end if;
  return new;
end;
$$;
revoke all on function private.set_note_credit() from public, anon;
grant execute on function private.set_note_credit() to authenticated;
create trigger set_note_credit before insert on public.community_notes
for each row execute function private.set_note_credit();

create table public.note_votes (
  note_id uuid not null references public.community_notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);
alter table public.note_votes enable row level security;
create policy note_votes_read_own on public.note_votes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy note_votes_insert_own on public.note_votes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy note_votes_delete_own on public.note_votes for delete to authenticated
  using ((select auth.uid()) = user_id);
grant select, insert, delete on public.note_votes to authenticated;

create function private.refresh_note_votes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.community_notes
  set vote_count = (select count(*) from public.note_votes where note_id = coalesce(new.note_id, old.note_id))
  where id = coalesce(new.note_id, old.note_id);
  return coalesce(new, old);
end;
$$;
revoke all on function private.refresh_note_votes() from public, anon, authenticated;
create trigger refresh_note_votes after insert or delete on public.note_votes
for each row execute function private.refresh_note_votes();

create table public.note_reports (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.community_notes(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 300),
  created_at timestamptz not null default now(),
  unique (note_id, reporter_id)
);
alter table public.note_reports enable row level security;
create policy note_reports_submit on public.note_reports for insert to authenticated
  with check ((select auth.uid()) = reporter_id);
grant insert on public.note_reports to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-notes', 'community-notes', false, 10485760,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy community_note_files_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'community-notes');
create policy community_note_files_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'community-notes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and lower(storage.extension(name)) in ('pdf', 'docx')
  );
create policy community_note_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'community-notes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create function public.increment_note_download(target_note uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.community_notes
  set download_count = download_count + 1
  where id = target_note and status = 'published';
end;
$$;
revoke all on function public.increment_note_download(uuid) from public;
grant execute on function public.increment_note_download(uuid) to anon, authenticated;

create table public.study_classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 3 and 80),
  subject text not null default 'Sejarah' check (char_length(subject) <= 60),
  form_level smallint not null check (form_level in (4, 5)),
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  created_at timestamptz not null default now()
);

create table public.class_members (
  class_id uuid not null references public.study_classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  display_name text not null default '' check (char_length(display_name) <= 60),
  school_name text not null default '' check (char_length(school_name) <= 120),
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

create function private.is_class_member(target_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.class_members
    where class_id = target_class and user_id = (select auth.uid())
  );
$$;
create function private.is_class_owner(target_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.study_classes
    where id = target_class and owner_id = (select auth.uid())
  );
$$;
revoke all on function private.is_class_member(uuid), private.is_class_owner(uuid) from public, anon;
grant execute on function private.is_class_member(uuid), private.is_class_owner(uuid) to authenticated;

alter table public.study_classes enable row level security;
create policy study_classes_read on public.study_classes for select to authenticated
  using ((select auth.uid()) = owner_id or private.is_class_member(id));
create policy study_classes_insert on public.study_classes for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy study_classes_update on public.study_classes for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy study_classes_delete on public.study_classes for delete to authenticated
  using ((select auth.uid()) = owner_id);
grant select, insert, update, delete on public.study_classes to authenticated;

alter table public.class_members enable row level security;
create policy class_members_read on public.class_members for select to authenticated
  using (private.is_class_member(class_id) or private.is_class_owner(class_id));
grant select on public.class_members to authenticated;

create function private.add_class_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.profiles%rowtype;
begin
  select * into p from public.profiles where id = new.owner_id;
  insert into public.class_members(class_id, user_id, role, display_name, school_name)
  values (new.id, new.owner_id, 'owner', coalesce(p.display_name, ''), coalesce(p.school_name, ''));
  return new;
end;
$$;
revoke all on function private.add_class_owner() from public, anon, authenticated;
create trigger add_class_owner after insert on public.study_classes
for each row execute function private.add_class_owner();

create function public.join_study_class(class_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target uuid; p public.profiles%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select id into target from public.study_classes where invite_code = upper(trim(class_code));
  if target is null then raise exception 'Class code not found'; end if;
  select * into p from public.profiles where id = (select auth.uid());
  insert into public.class_members(class_id, user_id, display_name, school_name)
  values (target, (select auth.uid()), coalesce(p.display_name, ''), coalesce(p.school_name, ''))
  on conflict (class_id, user_id) do nothing;
  return target;
end;
$$;
revoke all on function public.join_study_class(text) from public, anon;
grant execute on function public.join_study_class(text) to authenticated;

create table public.class_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.study_classes(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  question_set_id text not null check (char_length(question_set_id) <= 80),
  due_at timestamptz,
  created_at timestamptz not null default now()
);
create index class_assignments_class_idx on public.class_assignments(class_id, created_at desc);
alter table public.class_assignments enable row level security;
create policy class_assignments_read on public.class_assignments for select to authenticated
  using (private.is_class_member(class_id) or private.is_class_owner(class_id));
create policy class_assignments_insert on public.class_assignments for insert to authenticated
  with check ((select auth.uid()) = created_by and private.is_class_owner(class_id));
create policy class_assignments_update on public.class_assignments for update to authenticated
  using (private.is_class_owner(class_id)) with check (private.is_class_owner(class_id));
create policy class_assignments_delete on public.class_assignments for delete to authenticated
  using (private.is_class_owner(class_id));
grant select, insert, update, delete on public.class_assignments to authenticated;

alter table public.quiz_results
  add column if not exists assignment_id uuid references public.class_assignments(id) on delete set null;
create index quiz_results_assignment_idx on public.quiz_results(assignment_id, user_id, created_at desc)
  where assignment_id is not null;
drop policy if exists quiz_insert on public.quiz_results;
create policy quiz_insert on public.quiz_results for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      assignment_id is null
      or private.is_class_member((select a.class_id from public.class_assignments a where a.id = assignment_id))
    )
  );

create function public.get_weekly_leaderboard()
returns table(display_name text, school_name text, correct bigint, answered bigint, accuracy integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  return query
  select p.display_name, p.school_name, sum(q.score)::bigint, sum(q.total)::bigint,
    round(100.0 * sum(q.score) / nullif(sum(q.total), 0))::integer
  from public.quiz_results q join public.profiles p on p.id = q.user_id
  where p.leaderboard_opt_in = true and q.created_at >= date_trunc('week', now())
  group by p.id, p.display_name, p.school_name
  order by sum(q.score) desc, accuracy desc, p.display_name
  limit 25;
end;
$$;
revoke all on function public.get_weekly_leaderboard() from public, anon;
grant execute on function public.get_weekly_leaderboard() to authenticated;

create function public.get_class_leaderboard(target_class uuid)
returns table(display_name text, school_name text, correct bigint, answered bigint, accuracy integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_class_member(target_class) and not private.is_class_owner(target_class)
    then raise exception 'Class membership required';
  end if;
  return query
  select m.display_name, m.school_name, coalesce(sum(q.score), 0)::bigint,
    coalesce(sum(q.total), 0)::bigint,
    coalesce(round(100.0 * sum(q.score) / nullif(sum(q.total), 0)), 0)::integer
  from public.class_members m
  left join public.class_assignments a on a.class_id = m.class_id
  left join public.quiz_results q on q.assignment_id = a.id and q.user_id = m.user_id
  where m.class_id = target_class
  group by m.user_id, m.display_name, m.school_name
  order by coalesce(sum(q.score), 0) desc, accuracy desc, m.display_name;
end;
$$;
revoke all on function public.get_class_leaderboard(uuid) from public, anon;
grant execute on function public.get_class_leaderboard(uuid) to authenticated;
