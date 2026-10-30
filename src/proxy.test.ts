import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// The real app (not the demo) with made-up Supabase settings: no session
// cookie is sent, so nothing reaches the network.
async function loadProxy() {
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("ALLOWED_EMAIL", "owner@example.com");
  vi.resetModules();
  return (await import("./proxy")).proxy;
}

const request = (path: string) => new NextRequest(new URL(path, "https://planto-me.test"));

describe("proxy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sends signed-out visitors to the sign-in page", async () => {
    const proxy = await loadProxy();
    const response = await proxy(request("/"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://planto-me.test/login");
  });

  it("lets signed-out visitors open the sign-in page and the auth callback", async () => {
    const proxy = await loadProxy();
    expect((await proxy(request("/login"))).headers.get("location")).toBeNull();
    expect((await proxy(request("/auth/callback"))).headers.get("location")).toBeNull();
  });

  it("leaves the public demo open", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.resetModules();
    const { proxy } = await import("./proxy");
    expect((await proxy(request("/"))).headers.get("location")).toBeNull();
  });
});
