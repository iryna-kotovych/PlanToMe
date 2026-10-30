import { addDays, dayOfMonth, daysBetween, weekdayOf } from "@/lib/dates";
import type { Recurrence, Task } from "@/lib/types";

/** Whether a one-off or recurring task shows up on `day`. */
export function occursOn(
  task: Pick<Task, "date" | "recurrence">,
  day: string,
): boolean {
  const { date, recurrence } = task;
  if (!recurrence) return day === date;
  if (day < date) return false;

  switch (recurrence.kind) {
    case "daily":
      return true;
    case "weekdays": {
      const weekday = weekdayOf(day);
      return weekday >= 1 && weekday <= 5;
    }
    case "weekly":
      return recurrence.days.includes(weekdayOf(day));
    case "interval":
      return daysBetween(date, day) % recurrence.everyDays === 0;
    case "monthly": {
      const current = dayOfMonth(day);
      if (current === recurrence.dayOfMonth) return true;
      const isLastDayOfMonth = dayOfMonth(addDays(day, 1)) === 1;
      return isLastDayOfMonth && recurrence.dayOfMonth > current;
    }
  }
}

/** The first day on or after `from` on which a rule starting `from` occurs. */
export function firstOccurrence(recurrence: Recurrence, from: string): string {
  for (let offset = 0; offset < 31; offset++) {
    const day = addDays(from, offset);
    if (occursOn({ date: from, recurrence }, day)) return day;
  }
  return from;
}
