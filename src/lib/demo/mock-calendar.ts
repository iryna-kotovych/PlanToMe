import { useMemo } from "react";
import type { CalendarProvider, CalendarView } from "@/lib/calendar/types";
import { addDays, daysBetween, MAX_DAYS_AHEAD, weekdayOf } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/types";

// Invented events, placed relative to today so the demo always looks current.
const ONE_OFF: Record<number, Omit<CalendarEvent, "id" | "date">[]> = {
  0: [
    { title: "Ana's birthday", start: null, end: null },
    { title: "Dentist check-up", start: "17:30", end: "18:00" },
  ],
  1: [{ title: "Lunch with Marta", start: "13:30", end: "14:30" }],
  2: [{ title: "Farmers' market", start: "10:00", end: "11:00" }],
  3: [{ title: "Yoga class", start: "19:00", end: "20:00" }],
  4: [{ title: "Office closed", start: null, end: null }],
  6: [{ title: "Movie night", start: "21:00", end: "23:00" }],
};

export function mockEventsOn(day: string, today: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const weekday = weekdayOf(day);
  if (weekday >= 1 && weekday <= 5) {
    events.push({
      id: `demo-standup-${day}`,
      title: "Team stand-up",
      date: day,
      start: "09:30",
      end: "09:45",
    });
  }
  const offset = daysBetween(today, day);
  (ONE_OFF[offset] ?? []).forEach((event, index) => {
    events.push({ ...event, id: `demo-event-${day}-${index}`, date: day });
  });
  return events;
}

function useMockCalendar(today: string): CalendarView {
  return useMemo(() => {
    const events: CalendarEvent[] = [];
    for (let day = today; day <= addDays(today, MAX_DAYS_AHEAD); day = addDays(day, 1)) {
      events.push(...mockEventsOn(day, today));
    }
    return { events, connection: "connected" };
  }, [today]);
}

export const mockCalendar: CalendarProvider = {
  useCalendar: useMockCalendar,
  // Nothing to fetch; the short wait lets the refresh indicator show.
  refresh: () => new Promise((resolve) => window.setTimeout(() => resolve(true), 600)),
};
