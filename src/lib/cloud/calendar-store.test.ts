import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@/lib/types";

// The device side of the calendar: what the owner sees, when it asks the
// server, and what it keeps when the server can't be reached. The sync
// store is replaced by a stand-in; the server by a fake fetch.

const cloud = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { userId: null as string | null, status: "synced" };
  return {
    state,
    listeners,
    store: {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getUserId: () => state.userId,
      getStatus: () => state.status,
    },
    emit(next: Partial<typeof state>) {
      Object.assign(state, next);
      listeners.forEach((listener) => listener());
    },
  };
});
vi.mock("./cloud-store", () => ({ cloudStore: cloud.store }));

const OWNER = "owner-1";
const CACHE_KEY = `plantome.cloud.v1.calendar.${OWNER}`;
const CACHED: CalendarEvent = { id: "old", title: "Yoga class", date: "2026-11-03", start: "19:00", end: "20:00" };
const FRESH: CalendarEvent = { id: "new", title: "Lunch with Marta", date: "2026-11-03", start: "13:30", end: "14:30" };

const fetchMock = vi.fn<typeof fetch>();
const storage = new Map<string, string>();
const browser = { online: true };
const documentHandlers = new Map<string, () => void>();

function serverSays(body: object, status = 200) {
  fetchMock.mockImplementation(async () => Response.json(body, { status }));
}

function requests(): { pull: boolean }[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
}

async function openStore() {
  vi.resetModules();
  const { calendarStore } = await import("./calendar-store");
  calendarStore.subscribe(() => undefined);
  return calendarStore;
}

beforeEach(() => {
  vi.useFakeTimers();
  storage.clear();
  browser.online = true;
  // Stores opened by earlier tests stop listening.
  cloud.listeners.clear();
  cloud.state.userId = null;
  cloud.state.status = "synced";
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    },
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
    clearTimeout: (id: number) => clearTimeout(id),
    setInterval: (callback: () => void, delay: number) => setInterval(callback, delay),
    addEventListener: () => undefined,
  });
  vi.stubGlobal("navigator", {
    get onLine() {
      return browser.online;
    },
  });
  documentHandlers.clear();
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: (type: string, handler: () => void) => documentHandlers.set(type, handler),
  });
  serverSays({ status: "connected", complete: true, events: [FRESH] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("calendar on the device", () => {
  it("shows the device's copy at once, then what the server sends", async () => {
    storage.set(CACHE_KEY, JSON.stringify({ connection: "connected", events: [CACHED] }));
    const store = await openStore();
    cloud.emit({ userId: OWNER });
    expect(store.getView()).toEqual({ connection: "connected", events: [CACHED] });

    await vi.advanceTimersByTimeAsync(0);
    expect(store.getView()).toEqual({ connection: "connected", events: [FRESH] });
    expect(JSON.parse(storage.get(CACHE_KEY) ?? "null")).toEqual(store.getView());
    expect(requests()).toEqual([{ pull: true }]);
  });

  it("asks to connect, and remembers that, when Google Calendar isn't connected", async () => {
    serverSays({ status: "notConnected" });
    const store = await openStore();
    cloud.emit({ userId: OWNER });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getView()).toEqual({ connection: "notConnected", events: [] });
    expect(JSON.parse(storage.get(CACHE_KEY) ?? "null")).toEqual(store.getView());
  });

  it("keeps the device's copy when the server can't be reached", async () => {
    storage.set(CACHE_KEY, JSON.stringify({ connection: "connected", events: [CACHED] }));
    serverSays({ error: "unavailable" }, 503);
    const store = await openStore();
    cloud.emit({ userId: OWNER });
    expect(await store.refresh()).toBe(false);
    expect(store.getView().events).toEqual([CACHED]);
  });

  it("doesn't ask the server offline, signed out, or in a tab that isn't syncing", async () => {
    const store = await openStore();
    browser.online = false;
    cloud.emit({ userId: OWNER });
    expect(await store.refresh()).toBe(false);
    browser.online = true;
    cloud.emit({ status: "signedOut" });
    expect(await store.refresh()).toBe(false);
    cloud.emit({ status: "elsewhere" });
    expect(await store.refresh()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks one thing at a time and folds the waiting asks into one", async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const store = await openStore();
    cloud.emit({ userId: OWNER });
    const first = store.refresh();
    const second = store.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    answer(Response.json({ status: "connected", complete: true, events: [CACHED] }));
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.getView().events).toEqual([FRESH]);
  });

  it("sends saved changes to the calendar shortly after they reach the database", async () => {
    await openStore();
    cloud.emit({ userId: OWNER });
    await vi.advanceTimersByTimeAsync(0);
    cloud.emit({ status: "saving" });
    cloud.emit({ status: "synced" });
    cloud.emit({ status: "saving" });
    cloud.emit({ status: "synced" });
    await vi.advanceTimersByTimeAsync(1_500);
    expect(requests()).toEqual([{ pull: true }, { pull: false }]);
  });

  it("tries the rest again a minute later when the server could only do part", async () => {
    serverSays({ status: "connected", complete: false, events: [FRESH] });
    await openStore();
    cloud.emit({ userId: OWNER });
    await vi.advanceTimersByTimeAsync(0);
    serverSays({ status: "connected", complete: true });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(requests()).toEqual([{ pull: true }, { pull: false }]);
  });

  it("waits longer each time the server can still only do part", async () => {
    serverSays({ status: "connected", complete: false, events: [FRESH] });
    await openStore();
    cloud.emit({ userId: OWNER });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(119_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("looks again at once on coming back, until the calendar is connected", async () => {
    serverSays({ status: "notConnected" });
    const store = await openStore();
    cloud.emit({ userId: OWNER });
    await vi.advanceTimersByTimeAsync(0);
    // Connected in the browser a few seconds later.
    serverSays({ status: "connected", complete: true, events: [FRESH] });
    await vi.advanceTimersByTimeAsync(5_000);
    documentHandlers.get("visibilitychange")?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getView()).toEqual({ connection: "connected", events: [FRESH] });

    // Connected and fresh: switching back right away doesn't ask again.
    documentHandlers.get("visibilitychange")?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("forgets the calendar when the owner signs out", async () => {
    const store = await openStore();
    cloud.emit({ userId: OWNER });
    await vi.advanceTimersByTimeAsync(0);
    cloud.emit({ userId: null });
    expect(store.getView()).toEqual({ connection: null, events: [] });
  });

  it("doesn't put back on the device an answer that arrives after signing out", async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    await openStore();
    cloud.emit({ userId: OWNER });
    // Signing out drops the session and clears the device's copy before
    // this store hears about it.
    cloud.state.userId = null;
    storage.clear();
    answer(Response.json({ status: "connected", complete: true, events: [FRESH] }));
    await vi.advanceTimersByTimeAsync(0);
    expect(storage.has(CACHE_KEY)).toBe(false);
  });
});
