import "server-only";
import { z } from "zod";

// The few Google Calendar API calls PlanToMe makes, all on the owner's
// primary calendar (developers.google.com/workspace/calendar/api).

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const TIMEOUT_MS = 10_000;
const MAX_PAGES = 10;

/** A failed call. `status` is 0 when Google couldn't be reached at all. */
export class CalendarApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | null,
  ) {
    super(`Google Calendar API error ${status}${reason ? ` (${reason})` : ""}`);
  }

  /** Worth trying again later: the network, rate limits, Google's own errors. */
  get transient(): boolean {
    return (
      this.status === 0 ||
      this.status === 429 ||
      this.status >= 500 ||
      (this.status === 403 &&
        (this.reason === "rateLimitExceeded" || this.reason === "userRateLimitExceeded"))
    );
  }
}

const ErrorBodySchema = z.object({
  error: z.object({
    errors: z.array(z.object({ reason: z.string() })).optional(),
    status: z.string().optional(),
  }),
});

const PageSchema = z.object({
  items: z.array(z.unknown()).default([]),
  nextPageToken: z.string().optional(),
});

/** What PlanToMe writes to an event of its own. */
export interface EventBody {
  id?: string;
  summary: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  /** "confirmed" also brings back an event that was deleted in Google Calendar. */
  status?: "confirmed";
  /** "private": people who can see the calendar, but not edit it, see only "busy". */
  visibility?: "private";
  extendedProperties: { private: Record<string, string> };
}

async function call(
  accessToken: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options: { query?: Record<string, string>; body?: EventBody } = {},
): Promise<unknown> {
  const url = new URL(EVENTS_URL + path);
  if (options.query) url.search = new URLSearchParams(options.query).toString();
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new CalendarApiError(0, null);
  }
  if (!response.ok) {
    const body = ErrorBodySchema.safeParse(await response.json().catch(() => null));
    const reason = body.success
      ? (body.data.error.errors?.[0]?.reason ?? body.data.error.status ?? null)
      : null;
    throw new CalendarApiError(response.status, reason);
  }
  return response.status === 204 ? null : response.json();
}

function eventPath(eventId: string): string {
  return `/${encodeURIComponent(eventId)}`;
}

/**
 * Raw events from timeMin to timeMax (RFC 3339), recurring ones expanded
 * into single occurrences.
 */
export async function listEvents(
  accessToken: string,
  range: { timeMin: string; timeMax: string },
): Promise<unknown[]> {
  const items: unknown[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = PageSchema.parse(
      await call(accessToken, "GET", "", {
        query: {
          timeMin: range.timeMin,
          timeMax: range.timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "2500",
          ...(pageToken ? { pageToken } : {}),
        },
      }),
    );
    items.push(...result.items);
    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }
  return items;
}

export async function insertEvent(accessToken: string, body: EventBody): Promise<void> {
  await call(accessToken, "POST", "", { body });
}

export async function patchEvent(
  accessToken: string,
  eventId: string,
  body: EventBody,
): Promise<void> {
  await call(accessToken, "PATCH", eventPath(eventId), { body });
}

/** Deleting an event that is already gone counts as done. */
export async function deleteEvent(accessToken: string, eventId: string): Promise<void> {
  try {
    await call(accessToken, "DELETE", eventPath(eventId));
  } catch (error) {
    if (error instanceof CalendarApiError && (error.status === 404 || error.status === 410)) {
      return;
    }
    throw error;
  }
}
