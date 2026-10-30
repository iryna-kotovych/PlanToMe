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
// tells this device when the other one changed something.

const CACHE_PREFIX = "plantome.cloud.v1.";
const LAST_USER_KEY = `${CACHE_PREFIX}last-user`;
/** How far back one-off tasks and check-offs are loaded. */
const HISTORY_DAYS = 30;
const RETRY_MS = 30_000;

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

const TaskDataSchema = z.object({
  tasks: z.array(TaskSchema),
  done: z.record(z.string(), z.literal(true)),
});

const CacheSchema = z.object({
  server: TaskDataSchema,
  pending: z.array(MutationSchema),
});

const CompletionRowSchema = z.object({ item_id: z.string(), day: z.string() });

interface State {
  userId: string;
  /** False until there is something real to show (cache or first download). */
  ready: boolean;
  /** The data as the server last sent it. */
  server: TaskData;
  /** Local changes the server has not confirmed yet. */
  pending: Mutation[];
  /** `server` with `pending` laid on top: what the app shows. */
  view: TaskData;
  /** The last network attempt failed. */
  offline: boolean;
}

const EMPTY: TaskData = { tasks: [], done: {} };

let state: State | null = null;
let status: SyncStatus = "synced";
let started = false;
let flushing = false;
let sentCount = 0;
let pullTimer: number | undefined;
let retryTimer: number | undefined;
const listeners = new Set<() => void>();

/** A full page load resets this in-memory store and lets the proxy run. */
function goToLogin() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login");
}

function update(next: Partial<State>) {
  if (!state) return;
  const merged = { ...state, ...next };
  if (next.server || next.pending) {
    merged.view = applyPending(merged.server, merged.pending);
  }
  state = merged;
  status =
    state.offline || !navigator.onLine
      ? "offline"
      : state.pending.length > 0
        ? "saving"
        : "synced";
  try {
    window.localStorage.setItem(
      CACHE_PREFIX + state.userId,
      JSON.stringify({ server: state.server, pending: state.pending }),
    );
  } catch {
    // Storage full or blocked: keep working in memory.
  }
  listeners.forEach((listener) => listener());
}

function loadCache(userId: string): State {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + userId);
    const parsed = raw ? CacheSchema.safeParse(JSON.parse(raw)) : null;
    if (parsed?.success) {
      const { server, pending } = parsed.data;
      return {
        userId,
        ready: true,
        server,
        pending,
        view: applyPending(server, pending),
        offline: false,
      };
    }
  } catch {
    // Unreadable cache: start empty and download.
  }
  return {
    userId,
    ready: false,
    server: EMPTY,
    pending: [],
    view: EMPTY,
    offline: false,
  };
}

type SendResult = "sent" | "rejected" | "retry";

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
  if (!error) return "sent";
  // Bad data will never succeed; anything else (no network, expired session,
  // server trouble) is worth another try.
  const permanent =
    httpStatus >= 400 && httpStatus < 500 && ![401, 408, 429].includes(httpStatus);
  if (permanent) console.warn("PlanToMe: a change was rejected", error.message);
  return permanent ? "rejected" : "retry";
}

function scheduleRetry() {
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => void sync(), RETRY_MS);
}

async function flush() {
  if (!state || flushing) return;
  flushing = true;
  try {
    while (state && state.pending.length > 0) {
      const mutation = state.pending[0];
      if (!mutation) break;
      const result = await send(mutation);
      if (result === "retry") {
        update({ offline: true });
        scheduleRetry();
        return;
      }
      sentCount += 1;
      update({
        offline: false,
        server:
          result === "sent" ? applyMutation(state.server, mutation) : state.server,
        // A newer change to the same thing may already have replaced it.
        pending: state.pending.filter((queued) => queued !== mutation),
      });
    }
  } finally {
    flushing = false;
  }
}

async function pull() {
  if (!state) return;
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
  if (tasks.error || completions.error) {
    update({ offline: true, ready: true });
    scheduleRetry();
    return;
  }
  // A change went out while this was loading: the result may predate it.
  if (sentCount !== sentBefore) {
    schedulePull();
    return;
  }
  const done: TaskData["done"] = {};
  for (const row of completions.data) {
    const parsed = CompletionRowSchema.safeParse(row);
    if (parsed.success) done[doneKey(parsed.data.item_id, parsed.data.day)] = true;
  }
  update({
    ready: true,
    offline: false,
    server: {
      tasks: (tasks.data as TaskRow[])
        .map(rowToTask)
        .filter((task): task is Task => task !== null),
      done,
    },
  });
}

async function sync() {
  await flush();
  await pull();
}

function schedulePull() {
  window.clearTimeout(pullTimer);
  pullTimer = window.setTimeout(() => void pull(), 400);
}

function lastUserId(): string | null {
  try {
    return window.localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}

async function start() {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  // Offline, an expired session can't be refreshed: keep working from the
  // cache of whoever last signed in on this device.
  const userId =
    data.session?.user.id ?? (navigator.onLine ? null : lastUserId());
  if (!userId) {
    goToLogin();
    return;
  }
  try {
    window.localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    // Not remembered; only matters for offline launches.
  }
  state = loadCache(userId);
  update({});

  window.addEventListener("online", () => void sync());
  window.addEventListener("offline", () => update({}));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void sync();
  });
  supabase
    .channel(`plantome-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, schedulePull)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "completions" },
      schedulePull,
    )
    .subscribe();

  await sync();
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
  if (!state) return;
  update({ pending: enqueue(state.pending, mutation) });
  void flush();
}

/** Null until the owner's data has loaded (and always on the server). */
export function useCloudData(): TaskData | null {
  return useSyncExternalStore(
    subscribe,
    () => (state?.ready ? state.view : null),
    () => null,
  );
}

export function useCloudSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, () => status, () => "synced");
}

export const cloudStore = {
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
  carryOver(today: string) {
    if (!state?.ready) return;
    const before = state.view.tasks;
    const after = carryOver(before, state.view.done, today);
    after.forEach((task, index) => {
      if (task !== before[index]) mutate({ type: "saveTask", task });
    });
  },
  async signOut() {
    await supabaseBrowser().auth.signOut();
    try {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith(CACHE_PREFIX)) window.localStorage.removeItem(key);
      }
    } catch {
      // Nothing cached.
    }
    goToLogin();
  },
};
