import { occursOn } from "@/lib/recurrence";
import type {
  CalendarEvent,
  DayItem,
  DoneMarks,
  ItemKind,
  Task,
} from "@/lib/types";

export function doneKey(id: string, day: string): string {
  return `${id}@${day}`;
}

// Untimed items: all-day events first, then tasks, then habits.
const KIND_ORDER: Record<ItemKind, number> = { event: 0, task: 1, habit: 2 };

function compareItems(a: DayItem, b: DayItem): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.start !== null && b.start !== null) {
    return (
      a.start.localeCompare(b.start) || (a.end ?? "").localeCompare(b.end ?? "")
    );
  }
  if (a.start !== null) return 1;
  if (b.start !== null) return -1;
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
}

/**
 * The single mixed list for one day (spec 4.1): untimed items first, then
 * timed ones by time, and everything already checked off at the bottom.
 */
export function buildDayItems(
  day: string,
  tasks: Task[],
  events: CalendarEvent[],
  done: DoneMarks,
): DayItem[] {
  const items: DayItem[] = [];
  for (const event of events) {
    if (event.date !== day) continue;
    items.push({
      kind: "event",
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      done: Boolean(done[doneKey(event.id, day)]),
      carriedFrom: null,
    });
  }
  for (const task of tasks) {
    if (!occursOn(task, day)) continue;
    items.push({
      kind: task.recurrence ? "habit" : "task",
      id: task.id,
      title: task.title,
      start: task.time,
      end: task.endTime,
      done: Boolean(done[doneKey(task.id, day)]),
      carriedFrom: task.recurrence ? null : task.carriedFrom,
    });
  }
  return items.sort(compareItems);
}
