import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({ auth }),
}));

const { GET } = await import("./route");

async function redirectFor(query: string) {
  const url = new URL(`/auth/callback${query}`, "https://planto-me.test");
  const response = await GET(new NextRequest(url));
  return response.headers.get("location");
}

describe("sign-in callback", () => {
  beforeEach(() => vi.stubEnv("ALLOWED_EMAIL", "owner@example.com"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("says the account isn't the owner's when the sign-up hook refuses it", async () => {
    expect(
      await redirectFor(
        "?error=access_denied&error_code=unexpected_failure&error_description=This+PlanToMe+is+private.",
      ),
    ).toBe("https://planto-me.test/login?error=not-allowed");
  });

  it("treats a sign-in cancelled at Google as a failed sign-in", async () => {
    expect(
      await redirectFor("?error=access_denied&error_description=The+user+denied+access"),
    ).toBe("https://planto-me.test/login?error=sign-in");
  });

  it("opens the app for the owner", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { user: { email: "Owner@example.com" } },
      error: null,
    });
    expect(await redirectFor("?code=abc")).toBe("https://planto-me.test/");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("signs any other account straight out again", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { user: { email: "someone@example.com" } },
      error: null,
    });
    expect(await redirectFor("?code=abc")).toBe(
      "https://planto-me.test/login?error=not-allowed",
    );
    expect(auth.signOut).toHaveBeenCalled();
  });
});
