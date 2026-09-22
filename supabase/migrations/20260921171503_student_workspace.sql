create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check (length(display_name)<=60),
 form_level integer not null default 4 check (form_level in (4,5)),
 language text not null default 'bm' check (language in ('bm','en')),
 created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated using ((select auth.uid())=id);
create policy profiles_insert on public.profiles for insert to authenticated with check ((select auth.uid())=id);
create policy profiles_update on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
grant select,insert,update on public.profiles to authenticated;

create table public.chat_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (length(title)<=80), form_level integer not null default 4 check (form_level in (4,5)),
 created_at timestamptz not null default now(), unique(id,user_id)
);
create index chat_sessions_user_idx on public.chat_sessions(user_id,created_at desc);
alter table public.chat_sessions enable row level security;
create policy sessions_owner on public.chat_sessions for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.chat_sessions to authenticated;

create table public.chat_messages (
 id uuid primary key default gen_random_uuid(), session_id uuid not null, user_id uuid not null,
 role text not null check(role in ('user','assistant')), content text not null check(length(content)<=16000),
 sources jsonb not null default '[]', degraded boolean not null default false, created_at timestamptz not null default now(),
 foreign key(session_id,user_id) references public.chat_sessions(id,user_id) on delete cascade
);
create index chat_messages_session_idx on public.chat_messages(session_id,created_at);
alter table public.chat_messages enable row level security;
create policy messages_owner on public.chat_messages for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,delete on public.chat_messages to authenticated;

create table public.quiz_results (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 form_level integer not null check(form_level in(4,5)), score integer not null, total integer not null,
 created_at timestamptz not null default now(), check(total>0 and score>=0 and score<=total)
);
create index quiz_results_user_idx on public.quiz_results(user_id);
alter table public.quiz_results enable row level security;
create policy quiz_owner on public.quiz_results for select to authenticated using ((select auth.uid())=user_id);
create policy quiz_insert on public.quiz_results for insert to authenticated with check ((select auth.uid())=user_id);
grant select,insert on public.quiz_results to authenticated;

create table public.waitlist (
 id uuid primary key default gen_random_uuid(),email text unique not null check(length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 source text not null default 'pricing_pro' check(source='pricing_pro'),created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;
create policy waitlist_submit on public.waitlist for insert to anon,authenticated with check(source='pricing_pro');
grant insert(email,source) on public.waitlist to anon,authenticated;

create table public.tutor_usage (
 actor_hash text not null, day date not null default current_date, ask_count integer not null default 0,
 primary key(actor_hash,day)
);
alter table public.tutor_usage enable row level security;
revoke all on public.tutor_usage from anon,authenticated;
grant all on public.tutor_usage to service_role;
create function public.consume_tutor_quota(actor text, maximum integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.tutor_usage(actor_hash,day,ask_count) values(actor,current_date,1)
 on conflict(actor_hash,day) do update set ask_count=public.tutor_usage.ask_count+1
 where public.tutor_usage.ask_count<maximum returning ask_count into n;
 return n is not null;
end;$$;
revoke all on function public.consume_tutor_quota(text,integer) from public,anon,authenticated;
grant execute on function public.consume_tutor_quota(text,integer) to service_role;
