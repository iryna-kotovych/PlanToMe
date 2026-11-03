-- The format of the event PlanToMe last wrote (EVENT_FORMAT in
-- src/lib/calendar/plan.ts). When the format changes, for example when task
-- events became private, events written in an older one are rewritten once.
-- Null for events written before formats were counted.
alter table public.calendar_links add column event_format smallint;
