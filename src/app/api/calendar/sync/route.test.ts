import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  sync: vi.fn(),
}));
vi.mock("@/lib/supabase/owner", () => ({ signedInOwner: mocks.owner }));
vi.mock("@/lib/calendar/sync", () => ({ syncCalendar: mocks.sync }));

const { POST } = await import("./route");

function post(body: unknown) {
  return POST(
    new NextRequest(new URL("/api/calendar/sync", "https://planto-me.test"), {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

describe("/api/calendar/sync", () => {
  afterEach(() => vi.resetAllMocks());

  it("is only for the signed-in owner", async () => {
    mocks.owner.mockResolvedValue(null);
    expect((await post({ pull: true })).status).toBe(401);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("syncs for the owner and never lets the answer be cached", async () => {
    mocks.owner.mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
    mocks.sync.mockResolvedValue({ status: "notConnected" });
    const response = await post({ pull: true });
    expect(await response.json()).toEqual({ status: "notConnected" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.sync).toHaveBeenCalledWith("owner-1", { pull: true });
  });

  it("refuses a malformed request", async () => {
    mocks.owner.mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
    expect((await post({ pull: "yes" })).status).toBe(400);
  });

  it("answers 503 when Google or the database fails", async () => {
    mocks.owner.mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
    mocks.sync.mockRejectedValue(new Error("Google Calendar API error 0"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await post({ pull: false })).status).toBe(503);
  });
});
