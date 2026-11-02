import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import { addDays, APP_TIME_ZONE, dayKey } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/types";

/** Marks the events PlanToMe made for its tasks (extendedProperties.private). */
export const TASK_ID_PROPERTY = "plantomeTaskId";

const DAY_MS = 86_400_000;

// Only the fields the day list needs; anything else Google sends is ignored.
const GoogleEventSchema = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
  summary: z.string().optional(),
  eventType: z.string().optional(),
  start: z.object({ date: z.string().optional(), dateTime: z.string().optional() }),
  end: z
    .object({ date: z.string().optional(), dateTime: z.string().optional() })
    .optional(),
  attendees: z
    .array(z.object({ self: z.boolean().optional(), responseStatus: z.string().optional() }))
    .optional(),
  extendedProperties: z
    .object({ private: z.record(z.string(), z.string()).optional() })
    .optional(),
});

type GoogleEvent = z.infer<typeof GoogleEventSchema>;

function isListed(event: GoogleEvent, ownEventIds: ReadonlySet<string>): boolean {
  if (event.status === "cancelled") return false;
  // "Working from home" and the like describe the day; they're not plans.
  if (event.eventType === "workingLocation") return false;
  if (event.attendees?.some((guest) => guest.self && guest.responseStatus === "declined")) {
    return false;
  }
  // PlanToMe's own events: their tasks are in the list already.
  return !ownEventIds.has(event.id) && !event.extendedProperties?.private?.[TASK_ID_PROPERTY];
}

function localTime(instant: Date): string {
  return formatInTimeZone(instant, APP_TIME_ZONE, "HH:mm");
}

/**
 * Day-list rows for Google Calendar events on the days `from`…`to` (spec 5.1).
 * Recurring events arrive already expanded. An all-day event shows on every
 * day it covers. A timed one shows on the day it starts, with its end time
 * when it ends within a day (22:00–01:00 too); a longer one also shows as an
 * all-day row on each following day it runs into.
 */
export function toCalendarEvents(
  items: unknown[],
  range: { from: string; to: string },
  ownEventIds: ReadonlySet<string> = new Set(),
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const item of items) {
    const parsed = GoogleEventSchema.safeParse(item);
    if (!parsed.success || !isListed(parsed.data, ownEventIds)) continue;
    const event = parsed.data;
    const title = event.summary?.trim() || "(No title)";
    const add = (date: string, start: string | null, end: string | null) => {
      if (date >= range.from && date <= range.to) {
        events.push({ id: event.id, title, date, start, end });
      }
    };
    const addAllDay = (first: string, last: string) => {
      const from = first > range.from ? first : range.from;
      for (let day = from; day <= last && day <= range.to; day = addDays(day, 1)) {
        add(day, null, null);
      }
    };

    if (event.start.date) {
      // The end date of an all-day event is exclusive.
      const last = event.end?.date ? addDays(event.end.date, -1) : event.start.date;
      addAllDay(event.start.date, last);
      continue;
    }
    if (!event.start.dateTime) continue;
    const start = new Date(event.start.dateTime);
    const end = event.end?.dateTime ? new Date(event.end.dateTime) : start;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    const length = end.getTime() - start.getTime();
    const startTime = localTime(start);
    if (length <= DAY_MS) {
      const endTime = localTime(end);
      add(dayKey(start), startTime, length > 0 && endTime !== startTime ? endTime : null);
      continue;
    }
    add(dayKey(start), startTime, null);
    // Up to the day it ends on, unless it ends right at that day's midnight.
    addAllDay(addDays(dayKey(start), 1), dayKey(new Date(end.getTime() - 1)));
  }
  return events;
}
