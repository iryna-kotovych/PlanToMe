import { z } from "zod";

export const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const RecurrenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily") }),
  z.object({ kind: z.literal("weekdays") }),
  // Chosen weekdays, 0 = Sunday … 6 = Saturday.
  z.object({
    kind: z.literal("weekly"),
    days: z.array(z.number().int().min(0).max(6)).min(1),
  }),
  z.object({
    kind: z.literal("interval"),
    everyDays: z.number().int().min(2).max(365),
  }),
  // Short months use their last day.
  z.object({
    kind: z.literal("monthly"),
    dayOfMonth: z.number().int().min(1).max(31),
  }),
]);

export const AttachmentSchema = z.object({
  name: z.string(),
  type: z.string(),
  size: z.number().int().nonnegative(),
});

/** Same limits as the database (public.tasks). */
export const TITLE_MAX = 500;
export const NOTE_MAX = 5000;

export const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(TITLE_MAX),
  // For recurring items, the first day they occur.
  date: DaySchema,
  // HH:mm in the app time zone; null for untimed tasks.
  time: TimeSchema.nullable(),
  // An end before the start means the next morning (22:00–01:00).
  endTime: TimeSchema.nullable(),
  recurrence: RecurrenceSchema.nullable(),
  note: z.string().max(NOTE_MAX).nullable(),
  attachment: AttachmentSchema.nullable(),
  // Original day of an untimed task that was carried over.
  carriedFrom: DaySchema.nullable(),
});

export type Recurrence = z.infer<typeof RecurrenceSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;
export type Task = z.infer<typeof TaskSchema>;

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  /** HH:mm; null for all-day events. */
  start: string | null;
  end: string | null;
}

/** Done marks keyed by `${itemId}@${day}`, so each habit occurrence has its own. */
export type DoneMarks = Record<string, true>;

/** Everything the day list needs besides calendar events. */
export interface TaskData {
  tasks: Task[];
  done: DoneMarks;
}

export type ItemKind = "event" | "task" | "habit";

/** One row of the day list. */
export interface DayItem {
  kind: ItemKind;
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  done: boolean;
  carriedFrom: string | null;
}
