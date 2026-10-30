import { formatInTimeZone } from "date-fns-tz";

/** Instants are stored in UTC; days are always computed in this zone. */
export const APP_TIME_ZONE = "Europe/Madrid";

/** How many days ahead of today the owner can page to. */
export const MAX_DAYS_AHEAD = 7;

/** The calendar day (yyyy-MM-dd) an instant falls on in the app time zone. */
export function dayKey(instant: Date): string {
  return formatInTimeZone(instant, APP_TIME_ZONE, "yyyy-MM-dd");
}

// Day keys are plain calendar dates, so the helpers below do their math in
// UTC, where every day is exactly 24 hours long.
function toUtcDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function addDays(day: string, amount: number): string {
  const date = toUtcDate(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000,
  );
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(day: string): number {
  return toUtcDate(day).getUTCDay();
}

export function dayOfMonth(day: string): number {
  return toUtcDate(day).getUTCDate();
}

/** The first day strictly after `from` that falls on `weekday`. */
export function nextWeekday(from: string, weekday: number): string {
  return addDays(from, (weekday - weekdayOf(from) + 7) % 7 || 7);
}

/** Formats a day key with a date-fns pattern, e.g. "EEE, MMM d". */
export function formatDay(day: string, pattern: string): string {
  return formatInTimeZone(toUtcDate(day), "UTC", pattern);
}

/** "Friday, Oct 30" */
export function formatDayHeader(day: string): string {
  return formatDay(day, "EEEE, MMM d");
}

/** "Today", "Tomorrow" or "Wed, Nov 4". */
export function relativeDayLabel(day: string, today: string): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return formatDay(day, "EEE, MMM d");
}

/** "09:30 – 10:00", or just "09:30" without an end. */
export function formatTimeRange(start: string, end: string | null): string {
  return end ? `${start} – ${end}` : start;
}
