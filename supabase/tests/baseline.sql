-- Minimal stand-in for the live Supabase project, used to test migrations on plain Postgres.
-- Mirrors the live definitions (checked 2026-10-28) of the tables and helpers new migrations touch.
-- Not a migration: never apply this to the live project.

do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Supabase grants everything on new public objects to the API roles by default.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated;

create schema private;
grant usage on schema private to anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  form_level integer not null default 4,
  language text not null default 'bm',
  created_at timestamptz not null default now(),
  school_name text not null default '',
  school_state text not null default '',
  leaderboard_opt_in boolean not null default false
);
create table public.study_classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null default 'Sejarah',
  form_level smallint not null,
  invite_code text not null default upper(substr(md5(gen_random_uuid()::text), 1, 8)) unique,
  created_at timestamptz not null default now()
);
create table public.class_members (
  class_id uuid not null references public.study_classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  display_name text not null default '',
  school_name text not null default '',
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
create table public.class_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.study_classes(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null,
  question_set_id text not null,
  due_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  form_level integer not null,
  score integer not null,
  total integer not null,
  created_at timestamptz not null default now(),
  assignment_id uuid references public.class_assignments(id) on delete set null,
  question_set_id text,
  duration_seconds integer,
  timer_seconds integer
);
create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  form_level integer not null default 4,
  created_at timestamptz not null default now()
);

create function private.is_class_member(target_class uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.class_members where class_id = target_class and user_id = (select auth.uid()));
$$;
create function private.is_class_owner(target_class uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.study_classes where id = target_class and owner_id = (select auth.uid()));
$$;
revoke all on function private.is_class_member(uuid), private.is_class_owner(uuid) from public;
grant execute on function private.is_class_member(uuid), private.is_class_owner(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.study_classes enable row level security;
alter table public.class_members enable row level security;
alter table public.class_assignments enable row level security;
alter table public.quiz_results enable row level security;
alter table public.chat_sessions enable row level security;

create policy profiles_owner on public.profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy study_classes_read on public.study_classes for select using (((select auth.uid()) = owner_id) or private.is_class_member(id));
create policy study_classes_insert on public.study_classes for insert with check ((select auth.uid()) = owner_id);
create policy class_members_read on public.class_members for select using (private.is_class_member(class_id) or private.is_class_owner(class_id));
create policy class_assignments_read on public.class_assignments for select using (private.is_class_member(class_id) or private.is_class_owner(class_id));
create policy class_assignments_insert on public.class_assignments for insert with check (((select auth.uid()) = created_by) and private.is_class_owner(class_id));
create policy class_assignments_update on public.class_assignments for update using (private.is_class_owner(class_id)) with check (private.is_class_owner(class_id));
create policy quiz_owner on public.quiz_results for select using ((select auth.uid()) = user_id);
create policy quiz_insert on public.quiz_results for insert with check (((select auth.uid()) = user_id) and ((assignment_id is null) or private.is_class_member((select a.class_id from public.class_assignments a where a.id = quiz_results.assignment_id))));
create policy sessions_owner on public.chat_sessions for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.profiles, public.quiz_results, public.chat_sessions from anon;
revoke all on public.quiz_results from authenticated;
grant select, insert on public.quiz_results to authenticated;
