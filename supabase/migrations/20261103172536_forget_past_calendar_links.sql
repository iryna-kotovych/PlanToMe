-- Deleting a task deletes it from the database (privacy policy), including
-- the title its calendar link keeps. The link of an upcoming event goes when
-- the sync removes that event. An event that is already past stays in Google
-- Calendar (past days are never changed), so only its link is forgotten here.
-- The server calls this with the secret key at the start of every sync.
create function public.forget_past_calendar_links(owner_id uuid, today_start timestamptz)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with forgotten as (
    delete from public.calendar_links link
    where link.user_id = owner_id
      and link.starts_at < today_start
      and not exists (select 1 from public.tasks task where task.id = link.task_id)
    returning 1
  )
  select count(*)::integer from forgotten;
$$;

revoke all on function public.forget_past_calendar_links(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.forget_past_calendar_links(uuid, timestamptz) to service_role;
