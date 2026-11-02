import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Google Calendar callback with an in-memory Supabase and a fake Google
// token endpoint. Invented accounts and tokens throughout.

const fake = vi.hoisted(() => {
  const state = {
    requests: [] as { state: string; user_id: string; created_at: string }[],
    tokens: [] as Record<string, unknown>[],
    ownerEmail: "Owner@example.com",
  };
  const client = {
    from(table: string) {
      if (table === "google_tokens") {
        return {
          upsert: async (row: Record<string, unknown>) => {
            state.tokens = [...state.tokens.filter((t) => t.user_id !== row.user_id), row];
            return { error: null };
          },
        };
      }
      // google_connect_requests: delete().eq("state", …).select(…).maybeSingle()
      let wanted = "";
      const query = {
        delete: () => query,
        eq: (_column: string, value: string) => {
          wanted = value;
          return query;
        },
        select: () => query,
        maybeSingle: async () => {
          const found = state.requests.find((request) => request.state === wanted) ?? null;
          state.requests = state.requests.filter((request) => request !== found);
          return { data: found, error: null };
        },
      };
      return query;
    },
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { email: state.ownerEmail } }, error: null }),
      },
    },
  };
  return { state, client };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => fake.client }));

const { GET } = await import("./route");
const { openToken } = await import("@/lib/google/token-crypto");

const OWNER = "00000000-0000-4000-8000-000000000001";
const STATE = "s".repeat(43);
const CALENDAR = "https://www.googleapis.com/auth/calendar.events";
const fetchMock = vi.fn<typeof fetch>();

function idToken(email: string): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part({ email, email_verified: true })}.signature`;
}

function googleGrants(options: { scope?: string; email?: string } = {}) {
  fetchMock.mockImplementation(async (input) => {
    if (String(input).endsWith("/revoke")) return new Response(null, { status: 200 });
    return Response.json({
      access_token: "access-1",
      expires_in: 3599,
      refresh_token: "refresh-1",
      scope: options.scope ?? `openid ${CALENDAR}`,
      id_token: idToken(options.email ?? "owner@example.com"),
    });
  });
}

async function resultFor(query: string): Promise<string | null> {
  const url = new URL(`/auth/connect/callback${query}`, "https://planto-me.test");
  const location = (await GET(new NextRequest(url))).headers.get("location");
  return location ? new URL(location).searchParams.get("result") : null;
}

function tapped(minutesAgo = 1) {
  fake.state.requests = [
    {
      state: STATE,
      user_id: OWNER,
      created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    },
  ];
}

describe("Google Calendar callback", () => {
  beforeEach(() => {
    fake.state.requests = [];
    fake.state.tokens = [];
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id.example");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 5).toString("base64"));
    vi.stubGlobal("fetch", fetchMock);
    googleGrants();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("saves the owner's calendar access, sealed", async () => {
    tapped();
    expect(await resultFor(`?state=${STATE}&code=code-1`)).toBe("connected");
    const [saved] = fake.state.tokens;
    expect(saved).toMatchObject({ user_id: OWNER });
    expect(String(saved?.refresh_token_encrypted)).not.toContain("refresh-1");
    expect(await openToken(String(saved?.refresh_token_encrypted), OWNER)).toBe("refresh-1");
  });

  it("works only once per tap", async () => {
    tapped();
    await resultFor(`?state=${STATE}&code=code-1`);
    fake.state.tokens = [];
    expect(await resultFor(`?state=${STATE}&code=code-1`)).toBe("expired");
    expect(fake.state.tokens).toEqual([]);
  });

  it("refuses an unknown or old tap", async () => {
    expect(await resultFor(`?state=${STATE}&code=code-1`)).toBe("expired");
    expect(await resultFor("?code=code-1")).toBe("expired");
    tapped(11);
    expect(await resultFor(`?state=${STATE}&code=code-1`)).toBe("expired");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says so when the owner cancels or unticks the calendar", async () => {
    tapped();
    expect(await resultFor(`?state=${STATE}&error=access_denied`)).toBe("denied");
    tapped();
    googleGrants({ scope: "openid" });
    expect(await resultFor(`?state=${STATE}&code=code-1`)).toBe("denied");
    expect(fake.state.tokens).toEqual([]);
  });

  it("gives back access to another Google account straight away", async () => {
    tapped();
    googleGrants({ email: "someone@example.com" });
    expect(await resultFor(`?state=${STATE}&code=code-1`)).toBe("wrong-account");
    expect(fake.state.tokens).toEqual([]);
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/revoke"))).toBe(true);
  });

  it("gives back calendar access that came without a refresh token", async () => {
    tapped();
    fetchMock.mockImplementation(async (input) => {
      if (String(input).endsWith("/revoke")) return new Response(null, { status: 200 });
      return Response.json({
        access_token: "access-1",
        expires_in: 3599,
        scope: `openid ${CALENDAR}`,
        id_token: idToken("owner@example.com"),
      });
    });
    expect(await resultFor(`?state=${STATE}&code=code-1`)).toBe("error");
    expect(fake.state.tokens).toEqual([]);
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/revoke"))).toBe(true);
  });

  it("reports a failed exchange without saving anything", async () => {
    tapped();
    fetchMock.mockResolvedValue(new Response("{}", { status: 400 }));
    expect(await resultFor(`?state=${STATE}&code=code-1`)).toBe("error");
    expect(fake.state.tokens).toEqual([]);
  });
});
