import { taskToRow } from "@/lib/cloud/rows";
import type { Task } from "@/lib/types";

/** What PlanToMe writes to a task's event; start and end are UTC instants. */
export interface PushedEvent {
  summary: string;
  start: string;
  end: string;
}

/** A task's event in Google Calendar, and what PlanToMe last wrote to it. */
export interface CalendarLink {
  taskId: string;
  eventId: string;
  /** Null until the event's creation is confirmed. */
  pushed: PushedEvent | null;
}

export type CalendarChange =
  /** `eventId` is set when an earlier try may already have created it. */
  | { type: "create"; taskId: string; eventId: string | null; event: PushedEvent }
  | { type: "update"; taskId: string; eventId: string; event: PushedEvent }
  | { type: "delete"; taskId: string; eventId: string };

const DEFAULT_MINUTES = 30;

/**
 * The event a task should have: only one-off tasks with a time get one, 30
 * minutes long unless they have an end time (spec 5.1).
 */
export function eventFor(task: Task): PushedEvent | null {
  if (task.recurrence || !task.time) return null;
  const row = taskToRow(task);
  if (!row.starts_at) return null;
  const end =
    row.ends_at ??
    new Date(new Date(row.starts_at).getTime() + DEFAULT_MINUTES * 60_000).toISOString();
  return { summary: task.title, start: row.starts_at, end };
}

function samePushed(a: PushedEvent, b: PushedEvent): boolean {
  return a.summary === b.summary && a.start === b.start && a.end === b.end;
}

/**
 * What to change in Google Calendar so it matches the tasks (spec 5.1).
 *
 * - Events of past days stay as they were. A task moved to a past day still
 *   takes its event along, if that event was today or later.
 * - An event is only rewritten when its task changed since PlanToMe last
 *   wrote it, so an edit made in Google Calendar stays until then.
 * - A deleted task's event goes too, unless it was on a past day.
 *
 * @param tasks The owner's tasks dated today or later, and every linked
 *   task that still exists.
 * @param existingTaskIds Every linked task that still exists, whatever its
 *   date: only a link missing from here belongs to a deleted task.
 * @param todayStart The UTC instant today starts in the app time zone.
 */
export function planCalendarChanges(
  tasks: Task[],
  existingTaskIds: ReadonlySet<string>,
  links: CalendarLink[],
  today: string,
  todayStart: string,
): CalendarChange[] {
  const linkFor = new Map(links.map((link) => [link.taskId, link]));
  const changes: CalendarChange[] = [];

  for (const task of tasks) {
    const link = linkFor.get(task.id);
    const upcomingEvent = Boolean(link?.pushed && link.pushed.start >= todayStart);
    if (task.date < today && !upcomingEvent) continue;
    const event = eventFor(task);
    if (!event) {
      if (link) changes.push({ type: "delete", taskId: task.id, eventId: link.eventId });
    } else if (!link?.pushed) {
      changes.push({ type: "create", taskId: task.id, eventId: link?.eventId ?? null, event });
    } else if (!samePushed(link.pushed, event)) {
      changes.push({ type: "update", taskId: task.id, eventId: link.eventId, event });
    }
  }

  for (const link of links) {
    if (existingTaskIds.has(link.taskId)) continue;
    if (!link.pushed || link.pushed.start >= todayStart) {
      changes.push({ type: "delete", taskId: link.taskId, eventId: link.eventId });
    }
  }
  return changes;
}
