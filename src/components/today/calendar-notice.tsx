import type { CalendarConnection } from "@/lib/calendar/types";
import { CalendarIcon } from "../icons";

/**
 * Asks to connect Google Calendar, or to connect it again when Google
 * stopped accepting the connection (spec 4.4). A full page load: the
 * connection goes through Google's consent screen.
 */
export function CalendarNotice({
  connection,
}: {
  connection: Exclude<CalendarConnection, "connected">;
}) {
  const reconnect = connection === "reconnect";
  return (
    <div className="mt-2 flex items-center gap-3 rounded-2xl border border-line bg-white py-1 pr-1 pl-4">
      <CalendarIcon className="size-5 shrink-0 text-muted" />
      <p className="min-w-0 flex-1 text-sm text-muted">
        {reconnect
          ? "Google Calendar was disconnected."
          : "See your Google Calendar events here."}
      </p>
      <a
        href="/auth/connect"
        className="inline-flex min-h-11 shrink-0 items-center px-3 text-sm font-semibold text-ink underline underline-offset-4"
      >
        {reconnect ? "Reconnect" : "Connect"}
      </a>
    </div>
  );
}
