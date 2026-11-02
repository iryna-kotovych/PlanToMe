-- Carry-over (spec 5.4) runs here, on the stored data: unfinished untimed
-- one-off tasks from past days move to today in Europe/Madrid. A device
-- with an old copy of the list can then never bring back a task deleted on
-- the other device, or reopen one checked off there.
-- Security invoker: Row Level Security limits it to the caller's own tasks.
create function public.carry_over()
returns integer
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
          and c.day = t.date
      )
    returning t.id
  )
  select count(*)::integer from moved;
$$;

revoke all on function public.carry_over() from public, anon;
grant execute on function public.carry_over() to authenticated;
