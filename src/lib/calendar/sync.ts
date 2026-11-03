import "server-only";
import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import { rowToTask, TASK_COLUMNS, type TaskRow } from "@/lib/cloud/rows";
import { addDays, APP_TIME_ZONE, dayKey, MAX_DAYS_AHEAD } from "@/lib/dates";
import {
  CalendarApiError,
  deleteEvent,
  insertEvent,
  listEvents,
  patchEvent,
  type EventBody,
} from "@/lib/google/calendar-api";
import { GoogleGrantError, refreshAccessToken, type AccessToken } from "@/lib/google/oauth";
import { openToken, TokenKeyError } from "@/lib/google/token-crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { CalendarEvent, Task } from "@/lib/types";
import { TASK_ID_PROPERTY, toCalendarEvents } from "./google-events";
import {
  planCalendarChanges,
  type CalendarChange,
  type CalendarLink,
  type PushedEvent,
} from "./plan";

// Two-way calendar sync for the owner (spec 5.1), run by /api/calendar/sync:
// first PlanToMe's timed tasks are written to Google Calendar, then the
// events of today and the next days are read back for the day list.

export type CalendarSyncResult =
  | { status: "connected"; complete: boolean; events?: CalendarEvent[] }
  | { status: "notConnected" }
  | { status: "reconnect" };

/** Changes written per sync; any others wait for the next one. */
const MAX_CHANGES = 40;
/** Event ids may only use these characters (Calendar API, events.insert). */
const BASE32HEX = "0123456789abcdefghijklmnopqrstuv";
const ID_CHUNK = 100;

const LINK_COLUMNS = "task_id,event_id,summary,starts_at,ends_at,event_format";
const LinkRowSchema = z.object({
  task_id: z.string(),
  event_id: z.string(),
  summary: z.string().nullable(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  event_format: z.number().int().nullable(),
});
/** Events written before formats were counted. */
const FIRST_EVENT_FORMAT = 1;
const TokenRowSchema = z.object({ refresh_token_encrypted: z.string().nullable() });

// Access tokens last an hour: a warm server reuses them rather than asking
// Google for a new one on every sync.
const accessTokens = new Map<string, AccessToken>();

/** Calls Google as the owner, renewing the access token when it runs out. */
class GoogleSession {
  /** A renewal that failed (Google unreachable, say) isn't retried within one sync. */
  private failure: unknown = null;

  constructor(
    private readonly userId: string,
    private readonly refreshToken: string,
  ) {}

  private async token(): Promise<string> {
    const cached = accessTokens.get(this.userId);
    if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
    if (this.failure) throw this.failure;
    try {
      const fresh = await refreshAccessToken(this.refreshToken);
      accessTokens.set(this.userId, fresh);
      return fresh.token;
    } catch (error) {
      this.failure = error;
      throw error;
    }
  }

  async run<T>(call: (accessToken: string) => Promise<T>): Promise<T> {
    try {
      return await call(await this.token());
    } catch (error) {
      if (!(error instanceof CalendarApiError)) throw error;
      if (error.status === 403 && error.reason === "insufficientPermissions") {
        throw new GoogleGrantError("Calendar access was taken away");
      }
      if (error.status !== 401) throw error;
      accessTokens.delete(this.userId);
      return call(await this.token());
    }
  }
}

function startOfDay(day: string): string {
  return fromZonedTime(`${day}T00:00:00`, APP_TIME_ZONE).toISOString();
}

function newEventId(): string {
  const random = crypto.getRandomValues(new Uint8Array(26));
  return "plantome" + Array.from(random, (byte) => BASE32HEX[byte % 32]).join("");
}

function chunks<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

function isGone(error: unknown): boolean {
  return error instanceof CalendarApiError && (error.status === 404 || error.status === 410);
}

function toLink(row: z.infer<typeof LinkRowSchema>): CalendarLink {
  const pushed =
    row.summary !== null && row.starts_at && row.ends_at
      ? {
          summary: row.summary,
          start: new Date(row.starts_at).toISOString(),
          end: new Date(row.ends_at).toISOString(),
          format: row.event_format ?? FIRST_EVENT_FORMAT,
        }
      : null;
  return { taskId: row.task_id, eventId: row.event_id, pushed };
}

function eventBody(taskId: string, event: PushedEvent, id?: string): EventBody {
  return {
    ...(id ? { id } : {}),
    summary: event.summary,
    start: { dateTime: event.start, timeZone: APP_TIME_ZONE },
    end: { dateTime: event.end, timeZone: APP_TIME_ZONE },
    status: "confirmed",
    visibility: "private",
    extendedProperties: { private: { [TASK_ID_PROPERTY]: taskId } },
  };
}

/** The owner's tasks from today on, and the links that may need work. */
async function loadForPush(userId: string, today: string, todayStart: string) {
  const db = supabaseAdmin();
  const [upcomingTasks, unconfirmed, upcomingLinks] = await Promise.all([
    db.from("tasks").select(TASK_COLUMNS).eq("user_id", userId).gte("date", today),
    db.from("calendar_links").select(LINK_COLUMNS).eq("user_id", userId).is("starts_at", null),
    db
      .from("calendar_links")
      .select(LINK_COLUMNS)
      .eq("user_id", userId)
      .gte("starts_at", todayStart),
  ]);
  if (upcomingTasks.error) throw upcomingTasks.error;
  if (unconfirmed.error) throw unconfirmed.error;
  if (upcomingLinks.error) throw upcomingLinks.error;

  const rows = (upcomingTasks.data ?? []) as TaskRow[];
  const links = z
    .array(LinkRowSchema)
    .parse([...(unconfirmed.data ?? []), ...(upcomingLinks.data ?? [])])
    .map(toLink);

  // The other linked tasks: moved to a past day, or deleted.
  const known = new Set(rows.map((row) => row.id));
  const others = links.map((link) => link.taskId).filter((id) => !known.has(id));
  for (const ids of chunks(others, ID_CHUNK)) {
    const { data, error } = await db
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("user_id", userId)
      .in("id", ids);
    if (error) throw error;
    rows.push(...((data ?? []) as TaskRow[]));
  }
  const tasks = rows.map(rowToTask).filter((task): task is Task => task !== null);
  // Every row counts as existing, even one that isn't a valid task.
  return { tasks, existing: new Set(rows.map((row) => row.id)), links };
}

/** Claims an event id for a task's new event; an earlier claim wins. */
async function claimEventId(userId: string, taskId: string): Promise<string> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("calendar_links")
    .upsert(
      { task_id: taskId, user_id: userId, event_id: newEventId() },
      { onConflict: "task_id", ignoreDuplicates: true },
    );
  if (error) throw error;
  return currentEventId(userId, taskId);
}

async function currentEventId(userId: string, taskId: string): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("calendar_links")
    .select("event_id")
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .single();
  if (error) throw error;
  return z.object({ event_id: z.string() }).parse(data).event_id;
}

/** Swaps an event that is gone for good for a new id, unless another sync already did. */
async function replaceEventId(userId: string, taskId: string, oldId: string): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("calendar_links")
    .update({ event_id: newEventId(), summary: null, starts_at: null, ends_at: null })
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .eq("event_id", oldId)
    .select("event_id");
  if (error) throw error;
  const [row] = z.array(z.object({ event_id: z.string() })).parse(data ?? []);
  return row?.event_id ?? currentEventId(userId, taskId);
}

/** False when the link changed meanwhile: deleted with its task, or given another event. */
async function savePushed(
  userId: string,
  taskId: string,
  eventId: string,
  event: PushedEvent,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("calendar_links")
    .update({
      summary: event.summary,
      starts_at: event.start,
      ends_at: event.end,
      event_format: event.format,
    })
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .eq("event_id", eventId)
    .select("task_id");
  if (error) throw error;
  return z.array(z.unknown()).parse(data ?? []).length > 0;
}

/**
 * Creates the event under `eventId`. If that id exists already (an earlier
 * try got through, or it was deleted in Google Calendar since), it is
 * brought back as the task says. Returns the id the event ended up with.
 */
async function createEvent(
  google: GoogleSession,
  userId: string,
  taskId: string,
  eventId: string,
  event: PushedEvent,
): Promise<string> {
  try {
    await google.run((token) => insertEvent(token, eventBody(taskId, event, eventId)));
    return eventId;
  } catch (error) {
    if (!(error instanceof CalendarApiError) || error.status !== 409) throw error;
  }
  try {
    await google.run((token) => patchEvent(token, eventId, eventBody(taskId, event)));
    return eventId;
  } catch (error) {
    if (!isGone(error)) throw error;
  }
  const freshId = await replaceEventId(userId, taskId, eventId);
  await google.run((token) => insertEvent(token, eventBody(taskId, event, freshId)));
  return freshId;
}

async function applyChange(google: GoogleSession, userId: string, change: CalendarChange) {
  if (change.type === "delete") {
    await google.run((token) => deleteEvent(token, change.eventId));
    const { error } = await supabaseAdmin()
      .from("calendar_links")
      .delete()
      .eq("user_id", userId)
      .eq("task_id", change.taskId)
      .eq("event_id", change.eventId);
    if (error) throw error;
    return;
  }
  let eventId: string;
  if (change.type === "update") {
    try {
      await google.run((token) =>
        patchEvent(token, change.eventId, eventBody(change.taskId, change.event)),
      );
      eventId = change.eventId;
    } catch (error) {
      if (!isGone(error)) throw error;
      // Removed from Google Calendar for good: the task gets a new event.
      const freshId = await replaceEventId(userId, change.taskId, change.eventId);
      eventId = await createEvent(google, userId, change.taskId, freshId, change.event);
    }
  } else {
    const claimed = change.eventId ?? (await claimEventId(userId, change.taskId));
    eventId = await createEvent(google, userId, change.taskId, claimed, change.event);
  }
  if (!(await savePushed(userId, change.taskId, eventId, change.event))) {
    // Another sync deleted the task's link, or gave it another event, while
    // this one wrote: nothing would keep track of this event any more.
    await google.run((token) => deleteEvent(token, eventId));
  }
}

/** Writes the tasks' changes to Google Calendar. False if some had to wait. */
async function push(
  google: GoogleSession,
  userId: string,
  today: string,
  todayStart: string,
): Promise<{ complete: boolean; ownEventIds: Set<string> }> {
  const { tasks, existing, links } = await loadForPush(userId, today, todayStart);
  const changes = planCalendarChanges(tasks, existing, links, today, todayStart);
  let complete = changes.length <= MAX_CHANGES;
  for (const change of changes.slice(0, MAX_CHANGES)) {
    try {
      await applyChange(google, userId, change);
    } catch (error) {
      if (error instanceof GoogleGrantError || error instanceof TokenKeyError) throw error;
      complete = false;
      // Google refused this one change (a bad request, say): only its task waits.
      if (error instanceof CalendarApiError && !error.transient) {
        console.error("Couldn't update a calendar event", error);
        continue;
      }
      // Google or the database is down or busy: the rest waits for the next sync.
      console.error("Calendar changes have to wait", error);
      break;
    }
  }
  return { complete, ownEventIds: new Set(links.map((link) => link.eventId)) };
}

async function pull(
  google: GoogleSession,
  today: string,
  ownEventIds: ReadonlySet<string>,
): Promise<CalendarEvent[]> {
  const range = { from: today, to: addDays(today, MAX_DAYS_AHEAD) };
  const items = await google.run((token) =>
    listEvents(token, {
      timeMin: startOfDay(range.from),
      timeMax: startOfDay(addDays(range.to, 1)),
    }),
  );
  return toCalendarEvents(items, range, ownEventIds);
}

/**
 * A deleted task's past event stays in Google Calendar (past days are never
 * changed), but its title goes from the database along with the task.
 */
async function forgetPastLinks(userId: string, todayStart: string) {
  const { error } = await supabaseAdmin().rpc("forget_past_calendar_links", {
    owner_id: userId,
    today_start: todayStart,
  });
  if (error) throw error;
}

/**
 * Forgets a token Google no longer accepts, unless the owner has connected
 * again meanwhile. The row stays, so the app keeps asking to reconnect.
 */
async function disconnect(userId: string, sealedToken: string) {
  accessTokens.delete(userId);
  const { error } = await supabaseAdmin()
    .from("google_tokens")
    .update({ refresh_token_encrypted: null })
    .eq("user_id", userId)
    .eq("refresh_token_encrypted", sealedToken);
  if (error) throw error;
}

/**
 * Writes the owner's task changes to Google Calendar and, with `pull`,
 * returns the events for today … today + MAX_DAYS_AHEAD.
 */
export async function syncCalendar(
  userId: string,
  options: { pull: boolean },
): Promise<CalendarSyncResult> {
  const today = dayKey(new Date());
  // Database only, so it happens even while Google Calendar is disconnected.
  await forgetPastLinks(userId, startOfDay(today));
  const { data, error } = await supabaseAdmin()
    .from("google_tokens")
    .select("refresh_token_encrypted")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { status: "notConnected" };
  const sealed = TokenRowSchema.parse(data).refresh_token_encrypted;
  if (sealed === null) return { status: "reconnect" };

  let refreshToken: string;
  try {
    refreshToken = await openToken(sealed, userId);
  } catch (openError) {
    if (openError instanceof TokenKeyError) throw openError;
    // Sealed with a key the server no longer has: it can't be used again.
    await disconnect(userId, sealed);
    return { status: "reconnect" };
  }

  const google = new GoogleSession(userId, refreshToken);
  try {
    const { complete, ownEventIds } = await push(google, userId, today, startOfDay(today));
    if (!options.pull) return { status: "connected", complete };
    return { status: "connected", complete, events: await pull(google, today, ownEventIds) };
  } catch (syncError) {
    if (!(syncError instanceof GoogleGrantError)) throw syncError;
    await disconnect(userId, sealed);
    return { status: "reconnect" };
  }
}
