-- Run once in your Supabase project's SQL Editor. No service-role key is needed in the app.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.saved_courses (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
alter table public.profiles enable row level security;
alter table public.saved_courses enable row level security;
revoke all on public.profiles, public.saved_courses from anon;
grant select, insert, update, delete on public.profiles, public.saved_courses to authenticated;
drop policy if exists profiles_owner on public.profiles;
create policy profiles_owner on public.profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists saved_courses_owner on public.saved_courses;
create policy saved_courses_owner on public.saved_courses for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
