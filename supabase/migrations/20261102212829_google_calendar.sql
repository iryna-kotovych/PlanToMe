-- Google Calendar (spec 5.1). Like public.google_tokens, these tables have
-- no policies: neither the browser nor the signed-in owner can read them,
-- only the server with the secret key.

-- One row per "Connect Google Calendar" tap, found again by its random state
-- when Google sends the owner back. Keeping it here rather than in a cookie
-- lets the connection finish even in a browser that doesn't share the Home
-- Screen app's cookies.
create table public.google_connect_requests (
  state text primary key check (char_length(state) between 32 and 128),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- The calendar event PlanToMe made for a timed task. No foreign key to the
-- task on purpose: the row outlives a deleted task, so its event can still
-- be removed.
create table public.calendar_links (
  task_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id text not null check (char_length(event_id) between 5 and 1024),
  -- What PlanToMe last wrote to the event; all null while it is being created.
  summary text,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now()
);
create index calendar_links_user_start_idx on public.calendar_links (user_id, starts_at);
create trigger calendar_links_touch_updated_at
  before update on public.calendar_links
  for each row execute function private.touch_updated_at();

-- Null once Google stopped accepting the token: the app then asks the owner
-- to reconnect, rather than to connect as if for the first time.
alter table public.google_tokens alter column refresh_token_encrypted drop not null;

alter table public.google_connect_requests enable row level security;
alter table public.calendar_links enable row level security;
revoke all on public.google_connect_requests, public.calendar_links from anon, authenticated;

-- Never used: calendar_links holds each task's event.
alter table public.tasks drop column google_event_id;
