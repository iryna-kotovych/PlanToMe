import { useEffect, useState } from "react";
import type { CalendarProvider } from "@/lib/calendar/types";
import { addDays, MAX_DAYS_AHEAD } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/types";

/** Events for today and the days the owner can page to; null while loading. */
export function useCalendarEvents(
  provider: CalendarProvider,
  today: string,
): CalendarEvent[] | null {
  const [loaded, setLoaded] = useState<{
    today: string;
    events: CalendarEvent[];
  } | null>(null);

  useEffect(() => {
    let active = true;
    provider
      .listEvents({ from: today, to: addDays(today, MAX_DAYS_AHEAD) })
      .then(
        (events) => {
          if (active) setLoaded({ today, events });
        },
        () => {
          if (active) setLoaded({ today, events: [] });
        },
      );
    return () => {
      active = false;
    };
  }, [provider, today]);

  return loaded?.today === today ? loaded.events : null;
}
