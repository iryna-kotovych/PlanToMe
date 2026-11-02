import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addDays, APP_TIME_ZONE } from "@/lib/dates";
import { TaskSchema, type Task } from "@/lib/types";

// Tasks keep their day and wall-clock time in Europe/Madrid; the database
// stores timed tasks as UTC instants (starts_at / ends_at).

/** The columns of public.tasks the app reads and writes. */
export interface TaskRow {
  id: string;
  title: string;
  date: string;
  starts_at: string | null;
  ends_at: string | null;
  recurrence: unknown;
  note: string | null;
  carried_from: string | null;
}

export const TASK_COLUMNS =
  "id,title,date,starts_at,ends_at,recurrence,note,carried_from";

const HOUR_MS = 60 * 60 * 1000;

/** The UTC instant of a wall-clock time on a day in the app time zone. */
export function toInstant(day: string, time: string): string {
  const instant = fromZonedTime(`${day}T${time}:00`, APP_TIME_ZONE);
  // A time the spring clock change skips (02:00–02:59) moves an hour later,
  // the way calendars handle it.
  if (formatInTimeZone(instant, APP_TIME_ZONE, "HH:mm") !== time) {
    return new Date(instant.getTime() + HOUR_MS).toISOString();
  }
  return instant.toISOString();
}

function toLocalTime(instant: string): string {
  return formatInTimeZone(new Date(instant), APP_TIME_ZONE, "HH:mm");
}

/**
 * The end of a timed task. An end before the start is the next morning
 * (22:00–01:00); one that would not come after the start is left out, as
 * the database only accepts ends after starts.
 */
function endInstant(task: Task, start: string): string | null {
  if (!task.time || !task.endTime) return null;
  const day = task.endTime < task.time ? addDays(task.date, 1) : task.date;
  const end = toInstant(day, task.endTime);
  return end > start ? end : null;
}

export function taskToRow(task: Task): TaskRow {
  const start = task.time ? toInstant(task.date, task.time) : null;
  return {
    id: task.id,
    title: task.title,
    date: task.date,
    starts_at: start,
    ends_at: start ? endInstant(task, start) : null,
    recurrence: task.recurrence,
    note: task.note,
    carried_from: task.carriedFrom,
  };
}

/** Null when the row does not hold a valid task. */
export function rowToTask(row: TaskRow): Task | null {
  const parsed = TaskSchema.safeParse({
    id: row.id,
    title: row.title,
    date: row.date,
    time: row.starts_at ? toLocalTime(row.starts_at) : null,
    endTime: row.ends_at ? toLocalTime(row.ends_at) : null,
    recurrence: row.recurrence ?? null,
    note: row.note,
    // Attachments are stored separately and arrive with voice and pictures.
    attachment: null,
    carriedFrom: row.carried_from,
  });
  return parsed.success ? parsed.data : null;
}
