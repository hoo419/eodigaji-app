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


-- 2026-11-10: private workspace and immutable shared snapshots.
create table if not exists public.account_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.account_state enable row level security;
revoke all on public.account_state from anon;
grant select, insert, update, delete on public.account_state to authenticated;
drop policy if exists account_state_owner on public.account_state;
create policy account_state_owner on public.account_state for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.shared_courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.shared_courses enable row level security;
revoke all on public.shared_courses from anon, authenticated;
grant select, insert on public.shared_courses to authenticated;
drop policy if exists shared_courses_owner_read on public.shared_courses;
create policy shared_courses_owner_read on public.shared_courses for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists shared_courses_owner_insert on public.shared_courses;
create policy shared_courses_owner_insert on public.shared_courses for insert to authenticated
  with check ((select auth.uid()) = user_id);
-- Unlisted UUID capability: no public enumeration, owner IDs or write access.
create or replace function public.read_shared_course(share_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$ select data from public.shared_courses where id = share_id; $$;
revoke all on function public.read_shared_course(uuid) from public;
grant execute on function public.read_shared_course(uuid) to anon, authenticated;
