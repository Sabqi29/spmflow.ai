alter table public.profiles
  add column if not exists school_name text not null default ''
    check (char_length(school_name) <= 120),
  add column if not exists school_state text not null default ''
    check (char_length(school_state) <= 32),
  add column if not exists leaderboard_opt_in boolean not null default false;

comment on column public.profiles.school_name is
  'Student-provided school. Private by default under the existing owner-only profile RLS policy.';

comment on column public.profiles.school_state is
  'Student-selected school state. Private by default under the existing owner-only profile RLS policy.';

comment on column public.profiles.leaderboard_opt_in is
  'Explicit consent to show the profile display name and school in a future leaderboard projection.';
