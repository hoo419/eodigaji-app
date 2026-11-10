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
