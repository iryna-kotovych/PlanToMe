import type { CalendarEvent } from "@/lib/types";

/** "reconnect": Google stopped accepting the connection (spec 4.4). */
export type CalendarConnection = "connected" | "notConnected" | "reconnect";

export interface CalendarView {
  /** Events for today … today + MAX_DAYS_AHEAD; empty until they've loaded. */
  events: CalendarEvent[];
  /** Null until known. */
  connection: CalendarConnection | null;
}

/** The owner's primary calendar: Google in the real app, a mock in the demo. */
export interface CalendarProvider {
  useCalendar(today: string): CalendarView;
  /** Syncs now (pull to refresh); false when that didn't work. */
  refresh(): Promise<boolean>;
}
