import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  const state = { saved: [] as Record<string, unknown>[], failInsert: false };
  const query = {
    delete: () => query,
    eq: () => query,
    lt: async () => ({ error: null }),
    insert: async (row: Record<string, unknown>) => {
      if (state.failInsert) return { error: new Error("database down") };
      state.saved.push(row);
      return { error: null };
    },
  };
  // The real app unless a test says otherwise (CI runs with the demo setting).
  return { state, client: { from: () => query }, owner: vi.fn(), demo: false };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  get DEMO_MODE() {
    return fake.demo;
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => fake.client }));
vi.mock("@/lib/supabase/owner", () => ({ signedInOwner: fake.owner }));

const { GET } = await import("./route");

async function open() {
  const response = await GET(new NextRequest(new URL("/auth/connect", "https://planto-me.test")));
  return new URL(response.headers.get("location") ?? "");
}

describe("Connect Google Calendar", () => {
  beforeEach(() => {
    fake.state.saved = [];
    fake.state.failInsert = false;
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id.example");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
    fake.demo = false;
  });

  it("doesn't exist in the public demo", async () => {
    fake.demo = true;
    const response = await GET(new NextRequest(new URL("/auth/connect", "https://planto-me.test")));
    expect(response.status).toBe(404);
    expect(fake.owner).not.toHaveBeenCalled();
  });

  it("sends anyone but the owner to sign in", async () => {
    fake.owner.mockResolvedValue(null);
    expect((await open()).pathname).toBe("/login");
    expect(fake.state.saved).toEqual([]);
  });

  it("remembers the tap and sends the owner to Google with it", async () => {
    fake.owner.mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
    const url = await open();
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://planto-me.test/auth/connect/callback",
    );
    const [saved] = fake.state.saved;
    expect(saved).toEqual({ state: url.searchParams.get("state"), user_id: "owner-1" });
    expect(String(saved?.state)).toMatch(/^[\w-]{43}$/);
  });

  it("says something went wrong when the tap can't be saved", async () => {
    fake.owner.mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
    fake.state.failInsert = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const url = await open();
    expect(url.pathname).toBe("/auth/connect/done");
    expect(url.searchParams.get("result")).toBe("error");
  });
});
