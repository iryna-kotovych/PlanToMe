import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The calendar sync against an in-memory Supabase (secret-key client) and an
// in-memory Google Calendar behind a fake fetch. Invented data throughout.

const fake = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const KEYS: Record<string, string> = {
    tasks: "id",
    calendar_links: "task_id",
    google_tokens: "user_id",
  };
  // Columns a new row gets when the insert leaves them out, as in Postgres.
  const DEFAULTS: Record<string, Row> = {
    calendar_links: { summary: null, starts_at: null, ends_at: null },
  };
  const tables: Record<string, Row[]> = {};

  class Query implements PromiseLike<{ data: unknown; error: null }> {
    private filters: ((row: Row) => boolean)[] = [];
    private action: "select" | "insert" | "upsert" | "update" | "delete" = "select";
    private values: Row = {};
    private ignoreDuplicates = false;
    private mode: "many" | "single" | "maybe" = "many";

    constructor(private readonly table: string) {}

    select() {
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }
    is(column: string, value: unknown) {
      this.filters.push((row) => (row[column] ?? null) === value);
      return this;
    }
    gte(column: string, value: string) {
      this.filters.push((row) => row[column] != null && String(row[column]) >= value);
      return this;
    }
    lt(column: string, value: string) {
      this.filters.push((row) => row[column] != null && String(row[column]) < value);
      return this;
    }
    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[column]));
      return this;
    }
    insert(values: Row) {
      this.action = "insert";
      this.values = values;
      return this;
    }
    upsert(values: Row, options: { ignoreDuplicates?: boolean } = {}) {
      this.action = "upsert";
      this.values = values;
      this.ignoreDuplicates = options.ignoreDuplicates ?? false;
      return this;
    }
    update(values: Row) {
      this.action = "update";
      this.values = values;
      return this;
    }
    delete() {
      this.action = "delete";
      return this;
    }
    single() {
      this.mode = "single";
      return this;
    }
    maybeSingle() {
      this.mode = "maybe";
      return this;
    }

    private run(): Row[] {
      const rows = (tables[this.table] ??= []);
      const key = KEYS[this.table] ?? "id";
      const matching = rows.filter((row) => this.filters.every((filter) => filter(row)));
      const newRow = () => ({ ...DEFAULTS[this.table], ...this.values });
      switch (this.action) {
        case "select":
          return matching.map((row) => ({ ...row }));
        case "insert":
          rows.push(newRow());
          return [newRow()];
        case "upsert": {
          const existing = rows.find((row) => row[key] === this.values[key]);
          if (existing && this.ignoreDuplicates) return [];
          if (existing) Object.assign(existing, this.values);
          else rows.push(newRow());
          return [{ ...this.values }];
        }
        case "update":
          matching.forEach((row) => Object.assign(row, this.values));
          return matching.map((row) => ({ ...row }));
        case "delete":
          tables[this.table] = rows.filter((row) => !matching.includes(row));
          return matching;
      }
    }

    then<A = { data: unknown; error: null }, B = never>(
      onFulfilled?: ((value: { data: unknown; error: null }) => A | PromiseLike<A>) | null,
      onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
    ): PromiseLike<A | B> {
      const rows = this.run();
      const data = this.mode === "many" ? rows : (rows[0] ?? null);
      if (this.mode === "single" && !rows[0]) {
        return Promise.reject(new Error("no row")).then(null, onRejected);
      }
      return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
    }
  }

  const client = { from: (table: string) => new Query(table) };

  // Google: the owner's primary calendar, by event id.
  type Event = Record<string, unknown> & { id: string; status: string };
  const google = {
    events: new Map<string, Event>(),
    writes: [] as string[],
    refuseGrant: false,
    down: false,
    signInDown: false,
    tokenRequests: 0,
    expiredAccessTokens: new Set<string>(),
    refreshes: 0,
    /** Runs right after an event is created: another device acting meanwhile. */
    afterInsert: null as (() => void) | null,
  };

  function json(body: unknown, status = 200) {
    return new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  async function fetchFake(input: RequestInfo | URL, init: RequestInit = {}) {
    const url = new URL(String(input));
    if (url.href === "https://oauth2.googleapis.com/token") {
      google.tokenRequests += 1;
      if (google.signInDown) throw new TypeError("fetch failed");
      if (google.refuseGrant) return json({ error: "invalid_grant" }, 400);
      google.refreshes += 1;
      return json({ access_token: `access-${google.refreshes}`, expires_in: 3600, scope: "" });
    }
    if (google.down) throw new TypeError("fetch failed");
    const auth = new Headers(init.headers).get("Authorization") ?? "";
    if (google.expiredAccessTokens.has(auth.replace("Bearer ", ""))) {
      return json({ error: { status: "UNAUTHENTICATED" } }, 401);
    }
    const id = decodeURIComponent(url.pathname.split("/events/")[1] ?? "");
    const method = init.method ?? "GET";
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const existing = google.events.get(id);
    switch (method) {
      case "GET":
        return json({
          items: [...google.events.values()].filter((event) => event.status !== "cancelled"),
        });
      case "POST": {
        const newId = String(body.id);
        if (google.events.has(newId)) return json({ error: { errors: [{ reason: "duplicate" }] } }, 409);
        google.writes.push(`insert ${newId}`);
        google.events.set(newId, { ...body, id: newId, status: "confirmed" });
        google.afterInsert?.();
        return json(google.events.get(newId));
      }
      case "PATCH":
        if (!existing) return json({ error: { errors: [{ reason: "notFound" }] } }, 404);
        google.writes.push(`patch ${id}`);
        Object.assign(existing, body);
        return json(existing);
      case "DELETE":
        if (!existing) return json({ error: { errors: [{ reason: "notFound" }] } }, 404);
        if (existing.status === "cancelled") return json({ error: { errors: [{ reason: "deleted" }] } }, 410);
        google.writes.push(`delete ${id}`);
        existing.status = "cancelled";
        return json(null, 204);
      default:
        return json({}, 405);
    }
  }

  function reset() {
    for (const table of Object.keys(tables)) delete tables[table];
    google.events.clear();
    google.writes = [];
    google.refuseGrant = false;
    google.down = false;
    google.signInDown = false;
    google.tokenRequests = 0;
    google.expiredAccessTokens.clear();
    google.refreshes = 0;
    google.afterInsert = null;
  }

  return { tables, client, google, fetchFake, reset };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => fake.client }));

const OWNER = "00000000-0000-4000-8000-000000000001";
const KEY = Buffer.alloc(32, 3).toString("base64");

type SyncModule = typeof import("./sync");
let syncCalendar: SyncModule["syncCalendar"];

function taskRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    user_id: OWNER,
    title: "Call the bank",
    date: "2026-11-03",
    // 15:00 in Madrid (UTC+1 in November).
    starts_at: "2026-11-03T14:00:00+00:00",
    ends_at: null,
    recurrence: null,
    note: null,
    carried_from: null,
    ...overrides,
  };
}

const TASK_A = "aaaaaaaa-0000-4000-8000-000000000001";
const TASK_B = "bbbbbbbb-0000-4000-8000-000000000002";

function links() {
  return fake.tables.calendar_links ?? [];
}

function linkOf(taskId: string) {
  return links().find((row) => row.task_id === taskId);
}

function eventOf(taskId: string) {
  const id = linkOf(taskId)?.event_id;
  return typeof id === "string" ? fake.google.events.get(id) : undefined;
}

async function connect() {
  const { sealToken } = await import("@/lib/google/token-crypto");
  fake.tables.google_tokens = [
    {
      user_id: OWNER,
      refresh_token_encrypted: await sealToken("refresh-1", OWNER),
      scope: "openid email",
    },
  ];
}

beforeEach(async () => {
  fake.reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T08:00:00Z"));
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", KEY);
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id.example");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  vi.stubGlobal("fetch", vi.fn(fake.fetchFake));
  vi.resetModules();
  ({ syncCalendar } = await import("./sync"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("calendar sync", () => {
  it("does nothing until Google Calendar is connected", async () => {
    fake.tables.tasks = [taskRow(TASK_A)];
    expect(await syncCalendar(OWNER, { pull: true })).toEqual({ status: "notConnected" });
    expect(fake.google.writes).toEqual([]);
  });

  it("writes timed tasks to the calendar and reads the other events back", async () => {
    await connect();
    fake.tables.tasks = [
      taskRow(TASK_A),
      taskRow(TASK_B, { starts_at: null, title: "Buy milk" }),
    ];
    fake.google.events.set("dentist", {
      id: "dentist",
      status: "confirmed",
      summary: "Dentist",
      start: { dateTime: "2026-11-04T10:00:00+01:00" },
      end: { dateTime: "2026-11-04T10:30:00+01:00" },
    });

    const result = await syncCalendar(OWNER, { pull: true });

    expect(result).toEqual({
      status: "connected",
      complete: true,
      events: [{ id: "dentist", title: "Dentist", date: "2026-11-04", start: "10:00", end: "10:30" }],
    });
    expect(eventOf(TASK_A)).toMatchObject({
      summary: "Call the bank",
      start: { dateTime: "2026-11-03T14:00:00.000Z", timeZone: "Europe/Madrid" },
      end: { dateTime: "2026-11-03T14:30:00.000Z", timeZone: "Europe/Madrid" },
      extendedProperties: { private: { plantomeTaskId: TASK_A } },
    });
    expect(String(linkOf(TASK_A)?.event_id)).toMatch(/^plantome[0-9a-v]{26}$/);
    expect(linkOf(TASK_A)).toMatchObject({ summary: "Call the bank" });
    expect(linkOf(TASK_B)).toBeUndefined();
  });

  it("writes nothing when no task changed", async () => {
    await connect();
    fake.tables.tasks = [taskRow(TASK_A)];
    await syncCalendar(OWNER, { pull: false });
    fake.google.writes = [];
    await syncCalendar(OWNER, { pull: true });
    expect(fake.google.writes).toEqual([]);
  });

  it("moves the event with its task", async () => {
    await connect();
    fake.tables.tasks = [taskRow(TASK_A)];
    await syncCalendar(OWNER, { pull: false });
    fake.tables.tasks = [taskRow(TASK_A, { starts_at: "2026-11-05T09:00:00+00:00", date: "2026-11-05" })];
    await syncCalendar(OWNER, { pull: false });
    expect(eventOf(TASK_A)).toMatchObject({
      status: "confirmed",
      start: { dateTime: "2026-11-05T09:00:00.000Z" },
    });
  });

  it("removes the event when its task is deleted or loses its time", async () => {
    await connect();
    fake.tables.tasks = [taskRow(TASK_A), taskRow(TASK_B, { title: "Pick up the keys" })];
    await syncCalendar(OWNER, { pull: false });
    const eventA = String(linkOf(TASK_A)?.event_id);
    const eventB = String(linkOf(TASK_B)?.event_id);

    fake.tables.tasks = [taskRow(TASK_B, { title: "Pick up the keys", starts_at: null })];
    await syncCalendar(OWNER, { pull: false });

    expect(fake.google.events.get(eventA)?.status).toBe("cancelled");
    expect(fake.google.events.get(eventB)?.status).toBe("cancelled");
    expect(links()).toEqual([]);
  });

  it("keeps a deletion made in Google Calendar until the task changes", async () => {
    await connect();
    fake.tables.tasks = [taskRow(TASK_A)];
    await syncCalendar(OWNER, { pull: false });
    const event = eventOf(TASK_A);
    if (event) event.status = "cancelled";

    await syncCalendar(OWNER, { pull: false });
    expect(eventOf(TASK_A)?.status).toBe("cancelled");

    fake.tables.tasks = [taskRow(TASK_A, { title: "Call the bank about the card" })];
    await syncCalendar(OWNER, { pull: false });
    expect(eventOf(TASK_A)).toMatchObject({
      status: "confirmed",
      summary: "Call the bank about the card",
    });
  });

  it("makes a new event when the old one is gone for good", async () => {
    await connect();
    fake.tables.tasks = [taskRow(TASK_A)];
    await syncCalendar(OWNER, { pull: false });
    const oldId = String(linkOf(TASK_A)?.event_id);
    fake.google.events.delete(oldId);

    fake.tables.tasks = [taskRow(TASK_A, { title: "Call the bank about the card" })];
    await syncCalendar(OWNER, { pull: false });

    expect(linkOf(TASK_A)?.event_id).not.toBe(oldId);
    expect(eventOf(TASK_A)).toMatchObject({ summary: "Call the bank about the card" });
    expect(linkOf(TASK_A)).toMatchObject({ summary: "Call the bank about the card" });
  });

  it("finishes a creation that got through before its link was saved, without a duplicate", async () => {
    await connect();
    fake.tables.tasks = [taskRow(TASK_A)];
    fake.tables.calendar_links = [
      { task_id: TASK_A, user_id: OWNER, event_id: "plantomehalfmade", summary: null, starts_at: null, ends_at: null },
    ];
    fake.google.events.set("plantomehalfmade", { id: "plantomehalfmade", status: "confirmed", summary: "Call the bank" });

    expect(await syncCalendar(OWNER, { pull: false })).toEqual({ status: "connected", complete: true });

    expect(fake.google.events.size).toBe(1);
    expect(linkOf(TASK_A)).toMatchObject({ event_id: "plantomehalfmade", summary: "Call the bank" });
  });

  it("tries again after Google was unreachable, still without a duplicate", async () => {
    await connect();
    fake.tables.tasks = [taskRow(TASK_A)];
    // The access token works, then the Calendar API stops answering.
    await syncCalendar(OWNER, { pull: false }).catch(() => undefined);
    fake.google.events.clear();
    fake.tables.calendar_links = [];
    fake.google.down = true;

    expect(await syncCalendar(OWNER, { pull: false })).toEqual({ status: "connected", complete: false });
    await expect(syncCalendar(OWNER, { pull: true })).rejects.toThrow();

    fake.google.down = false;
    expect(await syncCalendar(OWNER, { pull: false })).toEqual({ status: "connected", complete: true });
    expect(fake.google.events.size).toBe(1);
  });

  it("leaves events of past days alone", async () => {
    await connect();
    fake.tables.calendar_links = [
      {
        task_id: TASK_A,
        user_id: OWNER,
        event_id: "plantomeyesterday",
        summary: "Call the bank",
        starts_at: "2026-11-02T14:00:00.000Z",
        ends_at: "2026-11-02T14:30:00.000Z",
      },
    ];
    fake.google.events.set("plantomeyesterday", { id: "plantomeyesterday", status: "confirmed" });
    await syncCalendar(OWNER, { pull: false });
    expect(fake.google.writes).toEqual([]);
    expect(links()).toHaveLength(1);
  });

  it("gets a new access token when Google says the old one expired", async () => {
    await connect();
    fake.tables.tasks = [taskRow(TASK_A)];
    await syncCalendar(OWNER, { pull: false });
    fake.google.expiredAccessTokens.add("access-1");
    expect(await syncCalendar(OWNER, { pull: true })).toMatchObject({ status: "connected" });
    expect(fake.google.refreshes).toBe(2);
  });

  it("keeps asking to reconnect once Google no longer accepts the connection", async () => {
    await connect();
    fake.google.refuseGrant = true;
    expect(await syncCalendar(OWNER, { pull: true })).toEqual({ status: "reconnect" });
    expect(fake.tables.google_tokens).toEqual([
      expect.objectContaining({ user_id: OWNER, refresh_token_encrypted: null }),
    ]);
    fake.google.tokenRequests = 0;
    expect(await syncCalendar(OWNER, { pull: false })).toEqual({ status: "reconnect" });
    expect(fake.google.tokenRequests).toBe(0);
  });

  it("asks to reconnect when the token was sealed with another key", async () => {
    await connect();
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 4).toString("base64"));
    expect(await syncCalendar(OWNER, { pull: true })).toEqual({ status: "reconnect" });
    expect(await syncCalendar(OWNER, { pull: true })).toEqual({ status: "reconnect" });
  });

  it("stops at once when Google's sign-in server can't be reached", async () => {
    await connect();
    fake.tables.tasks = [
      taskRow(TASK_A),
      taskRow(TASK_B, { title: "Pick up the keys" }),
      taskRow("cccccccc-0000-4000-8000-000000000003", { title: "Book a table" }),
    ];
    fake.google.signInDown = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await syncCalendar(OWNER, { pull: false })).toEqual({
      status: "connected",
      complete: false,
    });
    await expect(syncCalendar(OWNER, { pull: true })).rejects.toThrow();
    // One try per sync, not one per waiting change.
    expect(fake.google.tokenRequests).toBe(2);
    expect(fake.tables.google_tokens?.[0]?.refresh_token_encrypted).not.toBeNull();
  });

  it("removes an event whose task another device deleted while it was being made", async () => {
    await connect();
    fake.tables.tasks = [taskRow(TASK_A)];
    fake.google.afterInsert = () => {
      fake.tables.tasks = [];
      fake.tables.calendar_links = [];
    };
    await syncCalendar(OWNER, { pull: false });
    expect([...fake.google.events.values()].map((event) => event.status)).toEqual(["cancelled"]);
  });

  it("takes an upcoming event along when its task moves to a past day", async () => {
    await connect();
    fake.tables.tasks = [taskRow(TASK_A, { date: "2026-11-05", starts_at: "2026-11-05T09:00:00+00:00" })];
    await syncCalendar(OWNER, { pull: false });
    fake.tables.tasks = [taskRow(TASK_A, { date: "2026-11-01", starts_at: "2026-11-01T09:00:00+00:00" })];
    await syncCalendar(OWNER, { pull: false });
    expect(eventOf(TASK_A)).toMatchObject({ start: { dateTime: "2026-11-01T09:00:00.000Z" } });

    // From then on it is a past event and stays as it is.
    fake.tables.tasks = [];
    fake.google.writes = [];
    await syncCalendar(OWNER, { pull: false });
    expect(fake.google.writes).toEqual([]);
  });

  it("keeps the connection when the server's key is missing", async () => {
    await connect();
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    await expect(syncCalendar(OWNER, { pull: true })).rejects.toThrow();
    expect(fake.tables.google_tokens).toHaveLength(1);
  });
});
