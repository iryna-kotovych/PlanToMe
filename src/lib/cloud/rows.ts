import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { APP_TIME_ZONE } from "@/lib/dates";
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

/** The UTC instant of a wall-clock time on a day in the app time zone. */
export function toInstant(day: string, time: string): string {
  return fromZonedTime(`${day}T${time}:00`, APP_TIME_ZONE).toISOString();
}

function toLocalTime(instant: string): string {
  return formatInTimeZone(new Date(instant), APP_TIME_ZONE, "HH:mm");
}

export function taskToRow(task: Task): TaskRow {
  return {
    id: task.id,
    title: task.title,
    date: task.date,
    starts_at: task.time ? toInstant(task.date, task.time) : null,
    ends_at:
      task.time && task.endTime ? toInstant(task.date, task.endTime) : null,
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
