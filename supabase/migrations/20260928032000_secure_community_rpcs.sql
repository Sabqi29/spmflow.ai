grant usage on schema private to anon;

create function private.increment_note_download(target_note uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.community_notes
  set download_count = download_count + 1
  where id = target_note and status = 'published';
end;
$$;
revoke all on function private.increment_note_download(uuid) from public;
grant execute on function private.increment_note_download(uuid) to anon, authenticated;

create or replace function public.increment_note_download(target_note uuid) returns void
language sql security invoker set search_path = '' as $$
  select private.increment_note_download(target_note);
$$;

create function private.join_study_class(class_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target uuid; p public.profiles%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select id into target from public.study_classes where invite_code = upper(trim(class_code));
  if target is null then raise exception 'Class code not found'; end if;
  select * into p from public.profiles where id = (select auth.uid());
  insert into public.class_members(class_id, user_id, display_name, school_name)
  values (target, (select auth.uid()), coalesce(nullif(p.display_name, ''), 'Pelajar spmflow'), coalesce(p.school_name, ''))
  on conflict (class_id, user_id) do nothing;
  return target;
end;
$$;
revoke all on function private.join_study_class(text) from public, anon;
grant execute on function private.join_study_class(text) to authenticated;

create or replace function public.join_study_class(class_code text) returns uuid
language sql security invoker set search_path = '' as $$
  select private.join_study_class(class_code);
$$;

create function private.get_weekly_leaderboard()
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
revoke all on function private.get_weekly_leaderboard() from public, anon;
grant execute on function private.get_weekly_leaderboard() to authenticated;

create or replace function public.get_weekly_leaderboard()
returns table(display_name text, school_name text, correct bigint, answered bigint, accuracy integer)
language sql stable security invoker set search_path = '' as $$
  select * from private.get_weekly_leaderboard();
$$;

create function private.get_class_leaderboard(target_class uuid)
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
revoke all on function private.get_class_leaderboard(uuid) from public, anon;
grant execute on function private.get_class_leaderboard(uuid) to authenticated;

create or replace function public.get_class_leaderboard(target_class uuid)
returns table(display_name text, school_name text, correct bigint, answered bigint, accuracy integer)
language sql stable security invoker set search_path = '' as $$
  select * from private.get_class_leaderboard(target_class);
$$;

revoke all on function public.increment_note_download(uuid), public.join_study_class(text),
  public.get_weekly_leaderboard(), public.get_class_leaderboard(uuid) from public;
grant execute on function public.increment_note_download(uuid) to anon, authenticated;
grant execute on function public.join_study_class(text), public.get_weekly_leaderboard(),
  public.get_class_leaderboard(uuid) to authenticated;

create index if not exists community_notes_user_idx on public.community_notes(user_id);
create index if not exists study_classes_owner_idx on public.study_classes(owner_id);
create index if not exists class_members_user_idx on public.class_members(user_id);
create index if not exists class_assignments_creator_idx on public.class_assignments(created_by);
create index if not exists note_votes_user_idx on public.note_votes(user_id);
create index if not exists note_reports_reporter_idx on public.note_reports(reporter_id);
