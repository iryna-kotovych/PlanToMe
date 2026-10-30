-- PlanToMe schema. A single-user app: every row belongs to the signed-in
-- owner, and Row Level Security only lets the one allowed account in.

-- Helpers live in "private", which the Data API does not expose.
create schema if not exists private;

-- The one email allowed to sign in. It is added per project with SQL, never
-- in this public repository:
--   insert into private.allowed_emails (email) values ('<owner email>');
create table private.allowed_emails (
  email text primary key check (email = lower(email))
);
alter table private.allowed_emails enable row level security;

-- True when the current request comes from the allowed account.
create function private.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.allowed_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function private.is_allowed() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_allowed() to authenticated;

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Tasks and habits (a habit is a task with a recurrence rule).
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  -- The day in Europe/Madrid; for recurring items, the first day they occur.
  date date not null,
  -- Start and end of a timed task, in UTC. Null for untimed tasks.
  starts_at timestamptz,
  ends_at timestamptz check (ends_at is null or (starts_at is not null and ends_at > starts_at)),
  -- One rule per task, e.g. {"kind": "weekly", "days": [1, 4]}.
  recurrence jsonb check (
    recurrence is null
    or recurrence ->> 'kind' in ('daily', 'weekdays', 'weekly', 'interval', 'monthly')
  ),
  note text check (note is null or char_length(note) <= 5000),
  -- Original day of an untimed task that was carried over.
  carried_from date,
  -- The matching Google Calendar event, for timed tasks created in the app.
  google_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_date_idx on public.tasks (user_id, date);
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function private.touch_updated_at();

-- Check-offs, one per item and day. The item is a task id or a calendar
-- event id: checking off an event only ever changes the app.
create table public.completions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id text not null check (char_length(item_id) <= 1024),
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id, day)
);

create function private.delete_task_completions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.completions
  where user_id = old.user_id and item_id = old.id::text;
  return old;
end;
$$;
create trigger tasks_delete_completions
  after delete on public.tasks
  for each row execute function private.delete_task_completions();

-- Files attached to tasks; the files themselves are in the private
-- "attachments" storage bucket under <user id>/.
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  storage_path text not null unique,
  name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);
create index attachments_task_idx on public.attachments (task_id);

-- Web Push subscriptions, one per device.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  notifications_enabled boolean not null default false,
  remind_calendar_events boolean not null default true,
  reminder_minutes smallint not null default 15 check (reminder_minutes between 0 and 120),
  wrap_up_time time not null default '20:00',
  updated_at timestamptz not null default now()
);
create trigger settings_touch_updated_at
  before update on public.settings
  for each row execute function private.touch_updated_at();

-- The Google refresh token, encrypted by the server before it is stored.
-- No policies: neither the browser nor the signed-in user can read it, only
-- the server with the secret key.
create table public.google_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token_encrypted text not null,
  scope text not null,
  updated_at timestamptz not null default now()
);
create trigger google_tokens_touch_updated_at
  before update on public.google_tokens
  for each row execute function private.touch_updated_at();

-- Row Level Security on every table.
alter table public.tasks enable row level security;
alter table public.completions enable row level security;
alter table public.attachments enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.settings enable row level security;
alter table public.google_tokens enable row level security;

revoke all on public.tasks, public.completions, public.attachments,
  public.push_subscriptions, public.settings, public.google_tokens from anon;
revoke all on public.google_tokens from authenticated;

create policy "Owner manages own tasks" on public.tasks
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed()));

create policy "Owner manages own completions" on public.completions
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed()));

create policy "Owner manages own attachments" on public.attachments
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed()));

create policy "Owner manages own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed()));

create policy "Owner manages own settings" on public.settings
  for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed()))
  with check (user_id = (select auth.uid()) and (select private.is_allowed()));

-- Private bucket for attachments; each file lives under the owner's id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 20971520, array['image/*', 'application/pdf'])
on conflict (id) do nothing;

create policy "Owner reads own files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_allowed())
  );

create policy "Owner uploads own files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_allowed())
  );

create policy "Owner deletes own files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_allowed())
  );

-- Changes made on one device show up on the other right away.
alter publication supabase_realtime add table public.tasks, public.completions;
