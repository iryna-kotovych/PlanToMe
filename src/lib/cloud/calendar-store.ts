import { useEffect, useSyncExternalStore } from "react";
import { z } from "zod";
import type { SyncStatus } from "@/lib/backend";
import type { CalendarProvider, CalendarView } from "@/lib/calendar/types";
import { DaySchema, TimeSchema } from "@/lib/types";
import { cloudStore } from "./cloud-store";

// Google Calendar in the owner's real app (spec 5.1). The server does the
// syncing (/api/calendar/sync); this keeps what it returns on the device, so
// the list shows the calendar at once, even offline, and asks again on open,
// on pull to refresh, every few minutes and after changes are saved.

/** Starts like the sync store's keys, so signing out clears it too. */
const CACHE_PREFIX = "plantome.cloud.v1.calendar.";
const REQUEST_TIMEOUT_MS = 25_000;
const REFRESH_EVERY_MS = 5 * 60_000;
/** Coming back to the app reads the calendar again if it's older than this. */
const FRESH_MS = 60_000;
/** Several changes saved in a row go to the calendar together. */
const PUSH_DELAY_MS = 1_500;
/**
 * When the server could only write some changes, it tries the rest after a
 * minute, then waits twice as long each time, up to half an hour.
 */
const RETRY_FIRST_MS = 60_000;
const RETRY_MAX_MS = 30 * 60_000;

const EventSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: DaySchema,
  start: TimeSchema.nullable(),
  end: TimeSchema.nullable(),
});
const ConnectionSchema = z.enum(["connected", "notConnected", "reconnect"]);
const ResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("connected"),
    complete: z.boolean(),
    events: z.array(EventSchema).optional(),
  }),
  z.object({ status: z.literal("notConnected") }),
  z.object({ status: z.literal("reconnect") }),
]);
const CacheSchema = z.object({ connection: ConnectionSchema, events: z.array(EventSchema) });

const EMPTY: CalendarView = { events: [], connection: null };

let view: CalendarView = EMPTY;
let userId: string | null = null;
let syncStatus: SyncStatus = "synced";
let started = false;
let today: string | null = null;
let lastPull = 0;
let pushTimer: number | undefined;
let retryTimer: number | undefined;
let retryDelay = RETRY_FIRST_MS;
let running: Promise<boolean> | null = null;
let queued: { pull: boolean; done: Promise<boolean>; resolve: (ok: boolean) => void } | null =
  null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function setView(next: CalendarView) {
  view = next;
  if (userId && next.connection) {
    try {
      window.localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(next));
    } catch {
      // Storage full or blocked: the calendar loads again next time.
    }
  }
  notify();
}

function readCache(id: string): CalendarView {
  try {
    const parsed = CacheSchema.safeParse(
      JSON.parse(window.localStorage.getItem(CACHE_PREFIX + id) ?? "null"),
    );
    return parsed.success ? parsed.data : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Only the tab that syncs, while signed in and online, asks the server. */
function canSync(): boolean {
  return (
    userId !== null &&
    syncStatus !== "elsewhere" &&
    syncStatus !== "signedOut" &&
    navigator.onLine
  );
}

async function request(pull: boolean): Promise<boolean> {
  const owner = userId;
  if (!owner || !canSync()) return false;
  let response: Response;
  try {
    response = await fetch("/api/calendar/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pull }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return false;
  }
  // A 401 is the sync store's to sort out (it checks the session); a 503
  // means Google or the network let us down. The device copy stays.
  if (!response.ok) return false;
  const result = ResultSchema.safeParse(await response.json().catch(() => null));
  // Signing out clears the device's copy without telling this store first:
  // an answer for someone no longer signed in isn't kept.
  if (!result.success || owner !== cloudStore.getUserId()) return false;
  const data = result.data;
  if (pull) lastPull = Date.now();
  if (data.status !== "connected") {
    setView({ events: [], connection: data.status });
    return true;
  }
  if (data.complete) {
    window.clearTimeout(retryTimer);
    retryDelay = RETRY_FIRST_MS;
  } else {
    scheduleRetry();
  }
  if (data.events) {
    setView({ events: data.events, connection: "connected" });
  } else if (view.connection !== "connected") {
    setView({ ...view, connection: "connected" });
  }
  return true;
}

/** One request at a time; asking during one runs another right after it. */
function sync(pull: boolean): Promise<boolean> {
  if (!running) {
    running = request(pull).finally(() => {
      running = null;
      const next = queued;
      queued = null;
      if (next) void sync(next.pull).then(next.resolve);
    });
    return running;
  }
  if (queued) {
    queued.pull ||= pull;
    return queued.done;
  }
  let resolve: (ok: boolean) => void = () => undefined;
  const done = new Promise<boolean>((settle) => {
    resolve = settle;
  });
  queued = { pull, done, resolve };
  return done;
}

function schedulePush() {
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void sync(false), PUSH_DELAY_MS);
}

function scheduleRetry() {
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => void sync(false), retryDelay);
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
}

function pullIfStale() {
  if (document.visibilityState !== "visible") return;
  // Back from connecting Google Calendar in the browser: look at once.
  if (view.connection !== "connected" || Date.now() - lastPull > FRESH_MS) {
    void sync(true);
  }
}

function onCloudChange() {
  const nextUser = cloudStore.getUserId();
  const previousStatus = syncStatus;
  syncStatus = cloudStore.getStatus();
  if (nextUser !== userId) {
    userId = nextUser;
    lastPull = 0;
    view = nextUser ? readCache(nextUser) : EMPTY;
    notify();
    if (nextUser) void sync(true);
    return;
  }
  // Changes just reached the database: their events can follow.
  if (syncStatus === "synced" && previousStatus !== "synced") schedulePush();
}

function start() {
  // Both stores live as long as the page.
  cloudStore.subscribe(onCloudChange);
  onCloudChange();
  window.addEventListener("online", () => void sync(true));
  document.addEventListener("visibilitychange", pullIfStale);
  window.setInterval(() => {
    if (document.visibilityState === "visible") void sync(true);
  }, REFRESH_EVERY_MS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    start();
  }
  return () => {
    listeners.delete(listener);
  };
}

function setToday(day: string) {
  // After midnight a new day comes into view.
  if (today !== null && today !== day) void sync(true);
  today = day;
}

export const calendarStore = {
  subscribe,
  getView(): CalendarView {
    return view;
  },
  /** Pull to refresh: writes and reads the calendar now. */
  refresh(): Promise<boolean> {
    return sync(true);
  },
};

function useCloudCalendar(day: string): CalendarView {
  const current = useSyncExternalStore(subscribe, calendarStore.getView, () => EMPTY);
  useEffect(() => setToday(day), [day]);
  return current;
}

export const cloudCalendar: CalendarProvider = {
  useCalendar: useCloudCalendar,
  refresh: calendarStore.refresh,
};
