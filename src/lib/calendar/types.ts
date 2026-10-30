import type { CalendarEvent } from "@/lib/types";

/** Read access to the owner's primary calendar (Google, or a mock in the demo). */
export interface CalendarProvider {
  /** Events for the days `from`…`to` inclusive, with recurring ones expanded. */
  listEvents(range: { from: string; to: string }): Promise<CalendarEvent[]>;
}
