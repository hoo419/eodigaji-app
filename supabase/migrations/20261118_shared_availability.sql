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
