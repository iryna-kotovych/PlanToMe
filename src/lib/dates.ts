import { formatInTimeZone } from "date-fns-tz";

/** Instants are stored in UTC; days are always computed in this zone. */
export const APP_TIME_ZONE = "Europe/Madrid";

/** The calendar day (yyyy-MM-dd) an instant falls on in the app time zone. */
export function dayKey(instant: Date): string {
  return formatInTimeZone(instant, APP_TIME_ZONE, "yyyy-MM-dd");
}
