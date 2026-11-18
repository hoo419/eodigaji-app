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

alter table public.shared_courses
  add column if not exists availability jsonb not null default '[]'::jsonb;
revoke insert on public.shared_courses from authenticated;
grant insert (id, user_id, data) on public.shared_courses to authenticated;

create or replace function public.shared_course_availability(share_id uuid, availability jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  entry alias for $2;
  notes jsonb;
begin
  if entry is null then
    select s.availability into notes from public.shared_courses s where s.id = share_id;
    return notes;
  end if;

  if jsonb_typeof(entry) <> 'object'
     or (entry - array['date','start','end','name','memo']) <> '{}'::jsonb
     or jsonb_typeof(entry->'date') is distinct from 'string'
     or jsonb_typeof(entry->'start') is distinct from 'string'
     or jsonb_typeof(entry->'end') is distinct from 'string'
     or jsonb_typeof(entry->'name') is distinct from 'string'
     or jsonb_typeof(entry->'memo') is distinct from 'string'
     or (entry->>'date') !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$'
     or (entry->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or (entry->>'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or (entry->>'start') >= (entry->>'end')
     or length(entry->>'name') > 30 or length(entry->>'memo') > 300 then
    raise exception '가능한 날짜, 시간과 메모를 확인해 주세요.';
  end if;
  perform (entry->>'date')::date;

  select s.availability into notes from public.shared_courses s where s.id = share_id for update;
  if not found then return null; end if;
  if notes @> jsonb_build_array(entry) then return notes; end if;
  if jsonb_array_length(notes) >= 100 then raise exception '이 링크에는 일정 메모를 최대 100개까지 남길 수 있어요.'; end if;

  notes := notes || jsonb_build_array(entry);
  update public.shared_courses s set availability = notes where s.id = share_id;
  return notes;
end;
$$;

revoke all on function public.shared_course_availability(uuid, jsonb) from public;
grant execute on function public.shared_course_availability(uuid, jsonb) to anon, authenticated;
