import { isAuthRetryableFetchError, type RealtimeChannel } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { z } from "zod";
import type { SyncStatus } from "@/lib/backend";
import { carryOver } from "@/lib/carry-over";
import { addDays, dayKey } from "@/lib/dates";
import { doneKey } from "@/lib/day-items";
import { supabaseBrowser } from "@/lib/supabase/client";
import { TaskSchema, type Task, type TaskData } from "@/lib/types";
import { applyMutation, applyPending, enqueue, type Mutation } from "./queue";
import { rowToTask, TASK_COLUMNS, taskToRow, type TaskRow } from "./rows";

// The owner's data, cached in this browser so the app opens instantly and
// works offline. Every change shows at once, joins a queue, and the queue is
// sent to Supabase in order whenever the network allows (spec 5.7). Realtime
// tells this device when the other one changed something. Nothing is ever
// dropped: a change the server refuses stays queued and the status line says
// so.

const CACHE_PREFIX = "plantome.cloud.v1.";
const LAST_USER_KEY = `${CACHE_PREFIX}last-user`;
/** One tab at a time syncs; a newly opened tab takes over from the others. */
const TAB_LOCK = "plantome-cloud";
/** How far back one-off tasks and check-offs are loaded. */
const HISTORY_DAYS = 30;
const RETRY_MS = 30_000;
/** How often a change the server refused is tried again. */
const REFUSED_RETRY_MS = 5 * 60_000;

const MutationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("saveTask"), task: TaskSchema }),
  z.object({ type: z.literal("deleteTask"), id: z.string() }),
  z.object({
    type: z.literal("setDone"),
    itemId: z.string(),
    day: z.string(),
    done: z.boolean(),
  }),
]);

const DoneSchema = z.record(z.string(), z.literal(true));
const CompletionRowSchema = z.object({ item_id: z.string(), day: z.string() });

/** Why changes are waiting, if anything is wrong. */
type Problem = "offline" | "refused" | "signedOut" | null;

interface State {
  userId: string;
  /** False until there is something real to show (cache or first download). */
  ready: boolean;
  /** The data as the server last sent it. */
  server: TaskData;
  /** Local changes the server has not confirmed yet. */
  pending: Mutation[];
  /** Today, as the screen sees it; null until the screen has said. */
  today: string | null;
  /** `server` with `pending` and carry-over laid on top: what the app shows. */
  view: TaskData;
  problem: Problem;
}

const EMPTY: TaskData = { tasks: [], done: {} };

let state: State | null = null;
let status: SyncStatus = "synced";
let started = false;
/** The account of the session confirmed in this tab, if any. */
let signedInAs: string | null = null;
let connecting = false;
/** Another tab took over: this one stops syncing and writing. */
let takenOver = false;
/** The library removed this device's session (it announces SIGNED_OUT). */
let sessionEnded = false;
let flushing = false;
let sentCount = 0;
let pullCount = 0;
let appliedPull = 0;
/** The day the database last carried tasks over, from this tab. */
let carriedOn: string | null = null;
let pullTimer: number | undefined;
let retryTimer: number | undefined;
let channel: RealtimeChannel | null = null;
let releaseTabLock: (() => void) | null = null;
const cleanups: (() => void)[] = [];
const listeners = new Set<() => void>();

/** A full page load resets this in-memory store and lets the proxy run. */
function goToLogin() {
  if (window.location.pathname === "/login") return;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login");
}

function computeStatus(): SyncStatus {
  if (takenOver) return "elsewhere";
  if (!state) return "synced";
  if (state.problem === "signedOut") return "signedOut";
  if (state.problem === "offline" || !navigator.onLine) return "offline";
  if (state.problem === "refused") return "stuck";
  return state.pending.length > 0 ? "saving" : "synced";
}

function computeView(current: State): TaskData {
  const applied = applyPending(current.server, current.pending);
  if (!current.today) return applied;
  // Past unfinished tasks show on today at once, even offline; the database
  // makes the move permanent on the next sync (runCarryOver).
  const tasks = carryOver(applied.tasks, applied.done, current.today);
  return tasks === applied.tasks ? applied : { ...applied, tasks };
}

function notify() {
  listeners.forEach((listener) => listener());
}

function update(next: Partial<State>) {
  if (!state || takenOver) return;
  const merged = { ...state, ...next };
  if (next.server || next.pending || next.today) merged.view = computeView(merged);
  state = merged;
  status = computeStatus();
  try {
    window.localStorage.setItem(
      CACHE_PREFIX + state.userId,
      JSON.stringify({ server: state.server, pending: state.pending }),
    );
  } catch {
    // Storage full or blocked: keep working in memory.
  }
  notify();
}

/** The items of a list that are still valid; the rest are left out. */
function validItems<T>(items: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function readCache(userId: string): Pick<State, "server" | "pending"> | null {
  try {
    const raw: unknown = JSON.parse(
      window.localStorage.getItem(CACHE_PREFIX + userId) ?? "null",
    );
    if (typeof raw !== "object" || raw === null || !("server" in raw)) return null;
    const server: unknown = raw.server;
    if (typeof server !== "object" || server === null) return null;
    // Item by item, so one entry from an older version costs only itself.
    // If Task changes shape, migrate old entries here instead.
    return {
      server: {
        tasks: validItems("tasks" in server ? server.tasks : [], TaskSchema),
        done: DoneSchema.safeParse("done" in server ? server.done : {}).data ?? {},
      },
      pending: validItems("pending" in raw ? raw.pending : [], MutationSchema),
    };
  } catch {
    return null;
  }
}

/** Shows this account's copy from the device (or nothing yet). */
function adoptUser(userId: string) {
  const cached = readCache(userId);
  const next: State = {
    userId,
    ready: cached !== null,
    server: cached?.server ?? EMPTY,
    pending: cached?.pending ?? [],
    today: state?.today ?? null,
    view: EMPTY,
    problem: null,
  };
  next.view = computeView(next);
  state = next;
  status = computeStatus();
  try {
    window.localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    // Not remembered; only matters for offline launches.
  }
  notify();
}

function lastUserId(): string | null {
  try {
    return window.localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}

type SendResult = "sent" | "offline" | "unauthorized" | "refused";

/** What a failed request means for the queue. */
function failure(httpStatus: number): Exclude<SendResult, "sent"> {
  if (httpStatus === 401) return "unauthorized";
  // No answer (status 0), a timeout, rate limiting or server trouble.
  if (httpStatus === 0 || httpStatus === 408 || httpStatus === 429 || httpStatus >= 500) {
    return "offline";
  }
  return "refused";
}

async function send(mutation: Mutation): Promise<SendResult> {
  const supabase = supabaseBrowser();
  const request =
    mutation.type === "saveTask"
      ? supabase.from("tasks").upsert(taskToRow(mutation.task))
      : mutation.type === "deleteTask"
        ? supabase.from("tasks").delete().eq("id", mutation.id)
        : mutation.done
          ? supabase
              .from("completions")
              .upsert(
                { item_id: mutation.itemId, day: mutation.day },
                { onConflict: "user_id,item_id,day", ignoreDuplicates: true },
              )
          : supabase
              .from("completions")
              .delete()
              .eq("item_id", mutation.itemId)
              .eq("day", mutation.day);
  const { error, status: httpStatus } = await request;
  return error ? failure(httpStatus) : "sent";
}

function scheduleRetry(delay: number) {
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => void (signedInAs ? sync() : connect()), delay);
}

async function setback(result: Exclude<SendResult, "sent">) {
  if (result === "unauthorized") {
    await recheckSession();
  } else if (result === "offline") {
    update({ problem: "offline" });
    scheduleRetry(RETRY_MS);
  } else {
    // Kept at the head of the queue, never dropped; tried again later or on Retry.
    console.warn("PlanToMe: the server refused a change; it is kept on this device");
    update({ problem: "refused" });
    scheduleRetry(REFUSED_RETRY_MS);
  }
}

async function flush() {
  if (!state || !signedInAs || flushing || takenOver) return;
  flushing = true;
  try {
    while (state && signedInAs && !takenOver) {
      const mutation = state.pending[0];
      if (!mutation) break;
      const result = await send(mutation);
      if (!state) return;
      if (result !== "sent") {
        await setback(result);
        return;
      }
      sentCount += 1;
      update({
        problem: null,
        server: applyMutation(state.server, mutation),
        // A newer change to the same thing may already have replaced it.
        pending: state.pending.filter((queued) => queued !== mutation),
      });
    }
  } finally {
    flushing = false;
  }
}

async function pull() {
  if (!state || !signedInAs || takenOver) return;
  const pullId = ++pullCount;
  const sentBefore = sentCount;
  const supabase = supabaseBrowser();
  const since = addDays(dayKey(new Date()), -HISTORY_DAYS);
  const [tasks, completions] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .or(`date.gte.${since},recurrence.not.is.null`),
    supabase.from("completions").select("item_id,day").gte("day", since),
  ]);
  if (!state || takenOver) return;
  if (tasks.error || completions.error) {
    const failedStatus = tasks.error ? tasks.status : completions.status;
    if (failure(failedStatus) === "unauthorized") {
      await recheckSession();
    } else {
      update({ problem: "offline", ready: true });
      scheduleRetry(RETRY_MS);
    }
    return;
  }
  // A newer download already landed: this one is out of date.
  if (pullId < appliedPull) return;
  // A change went out while this was loading: the result may predate it.
  if (sentCount !== sentBefore) {
    schedulePull();
    return;
  }
  appliedPull = pullId;
  const done: TaskData["done"] = {};
  for (const row of completions.data) {
    const parsed = CompletionRowSchema.safeParse(row);
    if (parsed.success) done[doneKey(parsed.data.item_id, parsed.data.day)] = true;
  }
  update({
    ready: true,
    problem: state.problem === "refused" ? "refused" : null,
    server: {
      tasks: (tasks.data as TaskRow[])
        .map(rowToTask)
        .filter((task): task is Task => task !== null),
      done,
    },
  });
}

/**
 * Asks the database to carry unfinished tasks over, once a day and only
 * after this device's own changes are in (a check-off made offline counts).
 */
async function runCarryOver() {
  const today = state?.today;
  if (!today || carriedOn === today) return;
  const { data, error } = await supabaseBrowser().rpc("carry_over");
  // Not urgent: the list already shows them, and the next sync tries again.
  if (error) return;
  carriedOn = today;
  // The server changed: a download already on its way must not win.
  if (typeof data === "number" && data > 0) sentCount += 1;
}

async function sync() {
  if (!signedInAs || takenOver) return;
  await flush();
  if (!state || state.problem === "offline" || state.problem === "signedOut") return;
  if (state.pending.length === 0) await runCarryOver();
  await pull();
}

function schedulePull() {
  window.clearTimeout(pullTimer);
  pullTimer = window.setTimeout(() => void pull(), 400);
}

type SessionCheck = { userId: string } | "none" | "unreachable";

async function checkSession(): Promise<SessionCheck> {
  try {
    const { data, error } = await supabaseBrowser().auth.getSession();
    if (data.session) return { userId: data.session.user.id };
    // The library keeps the session when only the network failed.
    return error && isAuthRetryableFetchError(error) ? "unreachable" : "none";
  } catch {
    return "unreachable";
  }
}

/** After a 401: either the session ended, or a token refresh is on its way. */
async function recheckSession() {
  const session = await checkSession();
  if (session === "none") {
    signedOut();
  } else {
    update({ problem: "offline" });
    scheduleRetry(RETRY_MS);
  }
}

/** The session ended: changes stay on this device until signing in again. */
function signedOut() {
  signedInAs = null;
  stopRealtime();
  update({ problem: "signedOut" });
}

function startRealtime(userId: string) {
  if (channel) return;
  channel = supabaseBrowser()
    .channel(`plantome-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, schedulePull)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "completions" },
      schedulePull,
    )
    .subscribe();
}

function stopRealtime() {
  if (!channel) return;
  void supabaseBrowser().removeChannel(channel);
  channel = null;
}

/** Confirms the session, then syncs. Runs again when the network returns. */
async function connect() {
  if (signedInAs || connecting || takenOver) return;
  connecting = true;
  try {
    const session = await checkSession();
    if (takenOver) return;
    if (session === "unreachable") {
      if (state) update({ problem: "offline" });
      scheduleRetry(RETRY_MS);
      return;
    }
    if (session === "none") {
      // Waiting changes stay on the device and go out after signing in.
      if (state && !navigator.onLine) update({ problem: "signedOut" });
      else goToLogin();
      return;
    }
    signedInAs = session.userId;
    if (state?.userId === session.userId) update({ problem: null });
    else adoptUser(session.userId);
    startRealtime(session.userId);
    await sync();
  } finally {
    connecting = false;
  }
}

/** Waits for this tab to hold the sync lock; another tab taking it pauses this one. */
function takeTabLock(): Promise<void> {
  const locks = navigator.locks as LockManager | undefined;
  if (!locks) return Promise.resolve();
  return new Promise((ready) => {
    let held = false;
    locks
      .request(TAB_LOCK, { steal: true }, () => {
        held = true;
        ready();
        return new Promise<void>((release) => {
          releaseTabLock = release;
        });
      })
      // Taken by a newer tab; or no lock to be had, then sync without one.
      .catch(() => (held ? takeOver() : ready()));
  });
}

/** Everything is already saved on the device, so the other tab carries on from it. */
function takeOver() {
  stopWork();
  takenOver = true;
  status = computeStatus();
  notify();
}

/** Stops background work, so nothing is sent or saved from this tab again. */
function stopWork() {
  window.clearTimeout(pullTimer);
  window.clearTimeout(retryTimer);
  cleanups.splice(0).forEach((cleanup) => cleanup());
  stopRealtime();
  signedInAs = null;
}

function watchConnection() {
  const onOnline = () => void (signedInAs ? sync() : connect());
  const onOffline = () => update({});
  const onVisible = () => {
    if (document.visibilityState === "visible") onOnline();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  const { data } = supabaseBrowser().auth.onAuthStateChange((event) => {
    if (event !== "SIGNED_OUT") return;
    sessionEnded = true;
    if (signedInAs) signedOut();
  });
  cleanups.push(() => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    data.subscription.unsubscribe();
  });
}

async function start() {
  await takeTabLock();
  if (takenOver) return;
  // The device's copy shows at once: checking the session can take half a
  // minute on a network that never answers.
  const lastUser = lastUserId();
  if (lastUser) adoptUser(lastUser);
  watchConnection();
  await connect();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    void start();
  }
  return () => {
    listeners.delete(listener);
  };
}

function mutate(mutation: Mutation) {
  if (!state || takenOver) return;
  update({ pending: enqueue(state.pending, mutation) });
  void flush();
}

function clearCache() {
  try {
    const storage = window.localStorage;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) {
      if (key?.startsWith(CACHE_PREFIX)) storage.removeItem(key);
    }
  } catch {
    // Nothing cached.
  }
}

/** Null until the owner's data has loaded (and always on the server). */
export function useCloudData(): TaskData | null {
  return useSyncExternalStore(subscribe, cloudStore.getData, () => null);
}

export function useCloudSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, cloudStore.getStatus, () => "synced");
}

export type SignOutResult = "signedOut" | "cancelled" | "failed";

export const cloudStore = {
  subscribe,
  getData(): TaskData | null {
    return state?.ready ? state.view : null;
  },
  getStatus(): SyncStatus {
    return status;
  },
  toggleDone(id: string, day: string) {
    if (!state) return;
    const done = Boolean(state.view.done[doneKey(id, day)]);
    mutate({ type: "setDone", itemId: id, day, done: !done });
  },
  addTasks(tasks: Task[]) {
    tasks.forEach((task) => mutate({ type: "saveTask", task }));
  },
  updateTask(task: Task) {
    mutate({ type: "saveTask", task });
  },
  removeTasks(ids: string[]) {
    ids.forEach((id) => mutate({ type: "deleteTask", id }));
  },
  /** Tells the store which day is today; the database does the moving. */
  carryOver(today: string) {
    if (!state || state.today === today) return;
    update({ today });
    void sync();
  },
  /** Tries changes the server refused again, now. */
  retry() {
    if (!state || takenOver) return;
    update({ problem: null });
    void (signedInAs ? sync() : connect());
  },
  signIn() {
    goToLogin();
  },
  /** Signs out this device only, after warning about unsent changes. */
  async signOut(): Promise<SignOutResult> {
    if (state && state.pending.length > 0) {
      await flush();
      const waiting = state?.pending.length ?? 0;
      const changes = waiting === 1 ? "1 change hasn't" : `${waiting} changes haven't`;
      if (
        waiting > 0 &&
        !window.confirm(`${changes} been saved yet. Sign out anyway and lose it?`)
      ) {
        return "cancelled";
      }
    }
    sessionEnded = false;
    const { error } = await supabaseBrowser().auth.signOut({ scope: "local" });
    // With no network and an expired session the library can't sign out and
    // keeps the session; otherwise it removes it even if the server call failed.
    if (error && !sessionEnded) return "failed";
    stopWork();
    releaseTabLock?.();
    state = null;
    clearCache();
    goToLogin();
    return "signedOut";
  },
};
