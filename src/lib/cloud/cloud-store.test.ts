import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/types";
import { taskToRow } from "./rows";

// The real app's store against an invented Supabase that lives in memory:
// no network, no real accounts.

type Row = Record<string, unknown>;
type Answer = { data: unknown; error: { message: string } | null; status: number };

const fake = vi.hoisted(() => {
  const server = {
    tasks: new Map<string, Row>(),
    /** `${item_id}|${day}` */
    completions: new Set<string>(),
    online: true,
    /** Every data request is answered 401 (the session is gone). */
    unauthorized: false,
    /** Task rows the database refuses, like a failed check constraint. */
    refuse: null as ((row: Row) => boolean) | null,
    session: "ok" as "ok" | "none" | "unreachable",
    /** When set, the session check waits for it. */
    sessionGate: null as Promise<void> | null,
    /** Each read waits for the next gate, if any, after taking its snapshot. */
    readGates: [] as Promise<void>[],
    /** Each write waits for the next gate, if any. */
    writeGates: [] as Promise<void>[],
    /** When set, signing out waits for it. */
    signOutGate: null as Promise<void> | null,
    /** The database's own "today" in Europe/Madrid. */
    today: "",
    carryOverCalls: 0,
    signOutCalls: [] as unknown[],
    realtime: [] as (() => void)[],
    authListeners: new Set<(event: string) => void>(),
  };

  const offline: Answer = { data: null, error: { message: "FetchError" }, status: 0 };
  const unauthorized: Answer = { data: null, error: { message: "JWT expired" }, status: 401 };
  const done: Answer = { data: null, error: null, status: 201 };

  type Query = { table: string; op: string; row: Row | null; filters: Map<string, unknown> };

  async function read(query: Query): Promise<Answer> {
    const rows =
      query.table === "tasks"
        ? [...server.tasks.values()].map((row) => ({ ...row }))
        : [...server.completions].map((key) => {
            const [item_id, day] = key.split("|");
            return { item_id, day };
          });
    const gate = server.readGates.shift();
    if (gate) await gate;
    if (!server.online) return offline;
    if (server.unauthorized) return unauthorized;
    return { data: rows, error: null, status: 200 };
  }

  async function write(query: Query): Promise<Answer> {
    await (server.writeGates.shift() ?? Promise.resolve());
    if (!server.online) return offline;
    if (server.unauthorized) return unauthorized;
    const { row, filters } = query;
    if (query.table === "tasks" && query.op === "upsert" && row) {
      if (server.refuse?.(row)) {
        return { data: null, error: { message: "violates check constraint" }, status: 400 };
      }
      server.tasks.set(String(row.id), { ...row });
    } else if (query.table === "tasks" && query.op === "delete") {
      server.tasks.delete(String(filters.get("id")));
    } else if (query.table === "completions" && query.op === "upsert" && row) {
      server.completions.add(`${String(row.item_id)}|${String(row.day)}`);
    } else if (query.table === "completions" && query.op === "delete") {
      server.completions.delete(`${String(filters.get("item_id"))}|${String(filters.get("day"))}`);
    }
    return done;
  }

  function from(table: string) {
    const query: Query = { table, op: "select", row: null, filters: new Map() };
    const builder = {
      select: () => builder,
      or: () => builder,
      gte: () => builder,
      upsert: (row: Row) => {
        query.op = "upsert";
        query.row = row;
        return builder;
      },
      delete: () => {
        query.op = "delete";
        return builder;
      },
      eq: (column: string, value: unknown) => {
        query.filters.set(column, value);
        return builder;
      },
      then: (resolve: (answer: Answer) => unknown, reject: (error: unknown) => unknown) =>
        (query.op === "select" ? read(query) : write(query)).then(resolve, reject),
    };
    return builder;
  }

  /** Same rules as public.carry_over() in the migration. */
  async function carryOver(): Promise<Answer> {
    server.carryOverCalls += 1;
    if (!server.online) return offline;
    let moved = 0;
    for (const row of server.tasks.values()) {
      const date = String(row.date);
      // Checked off on its day or any later past day.
      const checkedOff = [...server.completions].some((key) => {
        const [itemId, day = ""] = key.split("|");
        return itemId === String(row.id) && day >= date && day < server.today;
      });
      if (date < server.today && !row.recurrence && !row.starts_at && !checkedOff) {
        row.carried_from = row.carried_from ?? date;
        row.date = server.today;
        moved += 1;
      }
    }
    return { data: { moved, day: server.today }, error: null, status: 200 };
  }

  // Shaped like the library's own AuthRetryableFetchError.
  const networkError = {
    __isAuthError: true,
    name: "AuthRetryableFetchError",
    message: "Failed to fetch",
    status: 0,
  };

  const client = {
    from,
    rpc: (name: string) => (name === "carry_over" ? carryOver() : Promise.reject(new Error(name))),
    auth: {
      async getSession() {
        if (server.sessionGate) await server.sessionGate;
        if (server.session === "ok") {
          return { data: { session: { user: { id: "user-1" } } }, error: null };
        }
        return {
          data: { session: null },
          error: server.session === "unreachable" ? networkError : null,
        };
      },
      async signOut(options: unknown) {
        if (server.signOutGate) await server.signOutGate;
        server.signOutCalls.push(options);
        server.session = "none";
        server.authListeners.forEach((listener) => listener("SIGNED_OUT"));
        return { error: null };
      },
      onAuthStateChange(listener: (event: string) => void) {
        server.authListeners.add(listener);
        return {
          data: { subscription: { unsubscribe: () => server.authListeners.delete(listener) } },
        };
      },
    },
    channel() {
      const channel = {
        on: (_type: string, _filter: unknown, callback: () => void) => {
          server.realtime.push(callback);
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: async () => "ok",
  };

  function reset() {
    server.tasks.clear();
    server.completions.clear();
    server.online = true;
    server.unauthorized = false;
    server.refuse = null;
    server.session = "ok";
    server.sessionGate = null;
    server.readGates.length = 0;
    server.writeGates.length = 0;
    server.signOutGate = null;
    server.today = "";
    server.carryOverCalls = 0;
    server.signOutCalls.length = 0;
    server.realtime.length = 0;
    server.authListeners.clear();
  }

  return { server, client, reset };
});

vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => fake.client }));

const USER = "user-1";
const CACHE_KEY = `plantome.cloud.v1.${USER}`;
// Monday 2 Nov 2026, 11:00 in Madrid.
const NOW = new Date("2026-11-02T10:00:00Z");
const TODAY = "2026-11-02";
const YESTERDAY = "2026-11-01";

function task(id: string, date: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    date,
    time: null,
    endTime: null,
    recurrence: null,
    note: null,
    attachment: null,
    carriedFrom: null,
    ...extra,
  };
}

/** A tab-lock manager like the browser's: `steal` takes the lock from its holder. */
function fakeLocks() {
  let holder: ((error: Error) => void) | null = null;
  return {
    request(_name: string, options: { steal?: boolean }, callback: () => Promise<void>) {
      return new Promise((resolve, reject) => {
        if (holder && options.steal) holder(new Error("AbortError"));
        holder = reject;
        callback().then(resolve, reject);
      });
    },
  };
}

function installBrowser({ locks }: { locks?: ReturnType<typeof fakeLocks> } = {}) {
  const storage = new Map<string, string>();
  const handlers = new Map<string, Set<() => void>>();
  const browser = {
    storage,
    online: true,
    confirmAnswer: true,
    assigned: [] as string[],
    /** Fires a window or document event, e.g. "online" or "visibilitychange". */
    fire: (type: string) => handlers.get(type)?.forEach((handler) => handler()),
  };
  const listen = (type: string, handler: () => void) => {
    const set = handlers.get(type) ?? new Set();
    set.add(handler);
    handlers.set(type, set);
  };
  const unlisten = (type: string, handler: () => void) => handlers.get(type)?.delete(handler);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, String(value)),
      removeItem: (key: string) => void storage.delete(key),
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() {
        return storage.size;
      },
    },
    location: { pathname: "/", assign: (url: string) => browser.assigned.push(url) },
    confirm: () => browser.confirmAnswer,
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
    clearTimeout: (id: number) => clearTimeout(id),
    addEventListener: listen,
    removeEventListener: unlisten,
  });
  vi.stubGlobal("navigator", {
    get onLine() {
      return browser.online;
    },
    locks,
  });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: listen,
    removeEventListener: unlisten,
  });
  return browser;
}

type Browser = ReturnType<typeof installBrowser>;

function saveOnDevice(
  browser: Browser,
  { tasks = [], done = {}, pending = [] }: { tasks?: Task[]; done?: Record<string, true>; pending?: unknown[] },
) {
  browser.storage.set("plantome.cloud.v1.last-user", USER);
  browser.storage.set(CACHE_KEY, JSON.stringify({ server: { tasks, done }, pending }));
}

/** Opens the app: a fresh store, subscribed the way the screen does. */
async function openApp() {
  vi.resetModules();
  const { cloudStore } = await import("./cloud-store");
  cloudStore.subscribe(() => {});
  return cloudStore;
}

async function settle(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

/** A promise the test resolves when it chooses. */
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

const ids = (data: { tasks: Task[] } | null) => data?.tasks.map((item) => item.id);

describe("cloud store", () => {
  let browser: Browser;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    fake.reset();
    fake.server.today = TODAY;
    browser = installBrowser();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("opening", () => {
    it("shows this device's copy before the session check answers", async () => {
      saveOnDevice(browser, { tasks: [task("a", TODAY)] });
      const session = gate();
      fake.server.sessionGate = session.promise;
      const store = await openApp();
      await settle();
      expect(ids(store.getData())).toEqual(["a"]);
      session.open();
    });

    it("stays on this device's copy when the session can't be checked offline", async () => {
      saveOnDevice(browser, { tasks: [task("a", TODAY)] });
      browser.online = false;
      fake.server.online = false;
      fake.server.session = "unreachable";
      const store = await openApp();
      await settle();
      expect(store.getStatus()).toBe("offline");
      expect(ids(store.getData())).toEqual(["a"]);
      expect(browser.assigned).toEqual([]);
    });

    it("sends a signed-out visitor to sign in", async () => {
      fake.server.session = "none";
      await openApp();
      await settle();
      expect(browser.assigned).toEqual(["/login"]);
    });

    it("downloads again after a failed download, with nothing waiting to send", async () => {
      fake.server.tasks.set("a", { ...taskToRow(task("a", TODAY)) });
      // The phone says it is online, but the first download gets no answer.
      fake.server.online = false;
      const store = await openApp();
      await settle();
      expect(store.getStatus()).toBe("offline");

      fake.server.online = true;
      await settle(30_000);
      expect(store.getStatus()).toBe("synced");
      expect(ids(store.getData())).toEqual(["a"]);
    });

    it("reconnects as soon as the library gets the session back", async () => {
      saveOnDevice(browser, {});
      fake.server.session = "unreachable";
      fake.server.online = false;
      const store = await openApp();
      await settle();
      expect(store.getStatus()).toBe("offline");

      fake.server.session = "ok";
      fake.server.online = true;
      fake.server.authListeners.forEach((listener) => listener("TOKEN_REFRESHED"));
      // Well before the 30-second retry.
      await settle(1);
      expect(store.getStatus()).toBe("synced");
    });

    it("keeps the valid saved changes when one can't be read", async () => {
      saveOnDevice(browser, {
        pending: [
          { type: "saveTask", task: task("a", TODAY) },
          { type: "saveTask", task: { ...task("b", TODAY), title: "" } },
        ],
      });
      browser.online = false;
      fake.server.online = false;
      fake.server.session = "unreachable";
      const store = await openApp();
      await settle();
      expect(ids(store.getData())).toEqual(["a"]);
    });
  });

  describe("carry-over", () => {
    it("never brings back a task deleted on the other device", async () => {
      // This device last saw the task open yesterday; the Mac deleted it since.
      saveOnDevice(browser, { tasks: [task("a", YESTERDAY)] });
      const session = gate();
      fake.server.sessionGate = session.promise;
      const store = await openApp();
      await settle();
      store.carryOver(TODAY);
      // Shown on today straight away, before anything is checked.
      expect(store.getData()?.tasks[0]).toMatchObject({ date: TODAY, carriedFrom: YESTERDAY });

      session.open();
      await settle();
      expect(fake.server.tasks.size).toBe(0);
      expect(store.getData()?.tasks).toEqual([]);
    });

    it("never reopens a task checked off on the other device", async () => {
      saveOnDevice(browser, { tasks: [task("a", YESTERDAY)] });
      fake.server.tasks.set("a", { ...taskToRow(task("a", YESTERDAY)) });
      fake.server.completions.add(`a|${YESTERDAY}`);
      const store = await openApp();
      await settle();
      store.carryOver(TODAY);
      await settle();
      expect(fake.server.tasks.get("a")?.date).toBe(YESTERDAY);
      expect(store.getData()?.done[`a@${YESTERDAY}`]).toBe(true);
      expect(store.getData()?.tasks[0]?.date).toBe(YESTERDAY);
    });

    it("moves unfinished tasks in the database, once a day", async () => {
      fake.server.tasks.set("a", { ...taskToRow(task("a", YESTERDAY)) });
      const store = await openApp();
      await settle();
      store.carryOver(TODAY);
      await settle();
      expect(fake.server.tasks.get("a")).toMatchObject({ date: TODAY, carried_from: YESTERDAY });
      expect(store.getData()?.tasks[0]).toMatchObject({ date: TODAY, carriedFrom: YESTERDAY });

      store.carryOver(TODAY);
      await settle();
      expect(fake.server.carryOverCalls).toBe(1);
    });

    it("keeps a carried task done when it was checked off offline", async () => {
      // Open on Nov 1. On Nov 2 the phone is offline all day: the task shows
      // on Nov 2 and is checked off there, but the database never moved it.
      vi.setSystemTime(new Date("2026-11-02T10:00:00Z"));
      saveOnDevice(browser, { tasks: [task("a", "2026-11-01")] });
      fake.server.tasks.set("a", { ...taskToRow(task("a", "2026-11-01")) });
      fake.server.online = false;
      browser.online = false;
      const store = await openApp();
      await settle();
      store.carryOver("2026-11-02");
      store.toggleDone("a", "2026-11-02");
      await settle();

      // Nov 3, back online.
      vi.setSystemTime(new Date("2026-11-03T10:00:00Z"));
      fake.server.today = "2026-11-03";
      fake.server.online = true;
      browser.online = true;
      store.carryOver("2026-11-03");
      await settle();
      expect(fake.server.completions.has("a|2026-11-02")).toBe(true);
      expect(fake.server.tasks.get("a")?.date).toBe("2026-11-01");
      expect(store.getData()?.tasks[0]?.date).toBe("2026-11-01");
    });

    it("catches up on the day's carry-over once waiting changes are sent", async () => {
      fake.server.tasks.set("a", { ...taskToRow(task("a", YESTERDAY)) });
      const store = await openApp();
      await settle();
      const slow = gate();
      fake.server.writeGates.push(slow.promise);
      store.addTasks([task("b", TODAY)]);
      // The new day starts while that change is on its way.
      store.carryOver(TODAY);
      await settle();
      expect(fake.server.carryOverCalls).toBe(0);

      slow.open();
      await settle(500);
      expect(fake.server.carryOverCalls).toBe(1);
      expect(fake.server.tasks.get("a")?.date).toBe(TODAY);
    });

    it("asks again shortly when the database's day is still yesterday", async () => {
      fake.server.tasks.set("a", { ...taskToRow(task("a", "2026-10-31")) });
      // The database's clock is a few seconds behind at midnight.
      fake.server.today = YESTERDAY;
      const store = await openApp();
      await settle();
      store.carryOver(TODAY);
      await settle();
      expect(fake.server.carryOverCalls).toBe(1);

      fake.server.today = TODAY;
      await settle(30_000);
      expect(fake.server.carryOverCalls).toBe(2);
      expect(fake.server.tasks.get("a")?.date).toBe(TODAY);
    });
  });

  describe("changes", () => {
    it("keeps a change the server refuses, says so, and sends it on retry", async () => {
      fake.server.refuse = (row) => row.title === "Refused";
      const store = await openApp();
      await settle();
      store.addTasks([task("a", TODAY, { title: "Refused" })]);
      await settle();
      expect(store.getStatus()).toBe("stuck");
      expect(store.getData()?.tasks.map((item) => item.title)).toEqual(["Refused"]);
      expect(browser.storage.get(CACHE_KEY)).toContain("Refused");

      fake.server.refuse = null;
      store.retry();
      await settle();
      expect(store.getStatus()).toBe("synced");
      expect(fake.server.tasks.has("a")).toBe(true);
    });

    it("sends the newer version at once when a refused change was replaced", async () => {
      fake.server.refuse = (row) => row.title === "Refused";
      const store = await openApp();
      await settle();
      const refused = task("a", TODAY, { title: "Refused" });
      store.addTasks([refused]);
      // Edited again while the first version is on its way.
      store.updateTask({ ...refused, title: "Fixed" });
      await settle();
      expect(store.getStatus()).toBe("synced");
      expect(fake.server.tasks.get("a")?.title).toBe("Fixed");
    });

    it("waits offline and sends everything when the network is back", async () => {
      const store = await openApp();
      await settle();
      browser.online = false;
      fake.server.online = false;
      store.addTasks([task("a", TODAY)]);
      store.toggleDone("a", TODAY);
      await settle();
      expect(store.getStatus()).toBe("offline");

      browser.online = true;
      fake.server.online = true;
      await settle(30_000);
      expect(store.getStatus()).toBe("synced");
      expect(fake.server.tasks.has("a")).toBe(true);
      expect(fake.server.completions.has(`a|${TODAY}`)).toBe(true);
    });

    it("never lets an older download replace a newer one", async () => {
      const store = await openApp();
      await settle();
      const slow = gate();
      // Both reads of the next download (tasks and check-offs) are slow.
      fake.server.readGates.push(slow.promise, slow.promise);
      fake.server.realtime[0]?.();
      await settle(500);
      fake.server.tasks.set("b", { ...taskToRow(task("b", TODAY)) });
      fake.server.realtime[0]?.();
      await settle(500);
      expect(ids(store.getData())).toEqual(["b"]);

      slow.open();
      await settle();
      expect(ids(store.getData())).toEqual(["b"]);
    });
  });

  describe("session", () => {
    it("shows 'Signed out' when the session ends, and keeps the changes", async () => {
      const store = await openApp();
      await settle();
      fake.server.unauthorized = true;
      fake.server.session = "none";
      store.addTasks([task("a", TODAY)]);
      await settle();
      expect(store.getStatus()).toBe("signedOut");
      expect(browser.storage.get(CACHE_KEY)).toContain('"id":"a"');
      // No surprise jump to the sign-in page in the middle of using the app.
      expect(browser.assigned).toEqual([]);

      store.signIn();
      expect(browser.assigned).toEqual(["/login"]);
    });

    it("stays on 'Signed out' when the app comes back or a retry fires", async () => {
      const store = await openApp();
      await settle();
      fake.server.unauthorized = true;
      fake.server.session = "none";
      store.addTasks([task("a", TODAY)]);
      await settle();
      expect(store.getStatus()).toBe("signedOut");

      browser.fire("visibilitychange");
      await settle(5 * 60_000);
      expect(store.getStatus()).toBe("signedOut");
      expect(browser.assigned).toEqual([]);
    });

    it("keeps 'Signed out' when a download lands afterwards", async () => {
      const store = await openApp();
      await settle();
      const slow = gate();
      fake.server.readGates.push(slow.promise, slow.promise);
      fake.server.realtime[0]?.();
      await settle(500);
      fake.server.session = "none";
      fake.server.authListeners.forEach((listener) => listener("SIGNED_OUT"));
      await settle();
      expect(store.getStatus()).toBe("signedOut");

      slow.open();
      await settle();
      expect(store.getStatus()).toBe("signedOut");
    });

    it("takes no new change while signing out", async () => {
      const store = await openApp();
      await settle();
      const slow = gate();
      fake.server.signOutGate = slow.promise;
      const result = store.signOut();
      store.addTasks([task("a", TODAY)]);
      expect(ids(store.getData())).toEqual([]);

      slow.open();
      expect(await result).toBe("signedOut");
    });

    it("signs out of this device only, and asks before losing unsent changes", async () => {
      const store = await openApp();
      await settle();
      browser.online = false;
      fake.server.online = false;
      store.addTasks([task("a", TODAY)]);
      await settle();

      browser.confirmAnswer = false;
      expect(await store.signOut()).toBe("cancelled");
      expect(fake.server.signOutCalls).toEqual([]);
      expect(browser.storage.get(CACHE_KEY)).toContain('"id":"a"');

      browser.confirmAnswer = true;
      expect(await store.signOut()).toBe("signedOut");
      expect(fake.server.signOutCalls).toEqual([{ scope: "local" }]);
      expect([...browser.storage.keys()].filter((key) => key.startsWith("plantome.cloud"))).toEqual(
        [],
      );
      expect(browser.assigned).toEqual(["/login"]);
    });
  });

  describe("tabs", () => {
    it("pauses this tab when another one takes over", async () => {
      const locks = fakeLocks();
      browser = installBrowser({ locks });
      const store = await openApp();
      await settle();
      // A newer tab opens.
      void locks.request("plantome-cloud", { steal: true }, () => new Promise(() => {}));
      await settle();
      expect(store.getStatus()).toBe("elsewhere");

      store.addTasks([task("a", TODAY)]);
      await settle();
      expect(fake.server.tasks.size).toBe(0);
      expect(browser.storage.get(CACHE_KEY) ?? "").not.toContain('"id":"a"');
    });
  });
});
