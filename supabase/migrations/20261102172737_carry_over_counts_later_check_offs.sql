-- Two fixes to public.carry_over():
-- - A check-off on the task's day or any later past day counts as done.
--   Offline, a device shows a carried task on the new day before the
--   database has moved it, so its check-off can land on that later day.
-- - It answers with the day it used ({"moved": n, "day": "YYYY-MM-DD"}), so
--   a device whose clock is a little ahead at midnight asks again later.
drop function public.carry_over();

create function public.carry_over()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  with today as (
    select (now() at time zone 'Europe/Madrid')::date as day
  ),
  moved as (
    update public.tasks t
    set date = today.day,
        carried_from = coalesce(t.carried_from, t.date)
    from today
    where t.date < today.day
      and t.recurrence is null
      and t.starts_at is null
      and not exists (
        select 1
        from public.completions c
        where c.user_id = t.user_id
          and c.item_id = t.id::text
          and c.day >= t.date
          and c.day < today.day
      )
    returning t.id
  )
  select jsonb_build_object(
    'moved', (select count(*) from moved),
    'day', (select day from today)
  );
$$;

revoke all on function public.carry_over() from public, anon;
grant execute on function public.carry_over() to authenticated;
