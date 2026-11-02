import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { openToken, sealToken, TokenKeyError } = await import("./token-crypto");

// An invented key and token; the real key lives only in the server's settings.
const KEY = Buffer.alloc(32, 7).toString("base64");
const TOKEN = "1//invented-refresh-token";

describe("sealed Google tokens", () => {
  beforeEach(() => vi.stubEnv("TOKEN_ENCRYPTION_KEY", KEY));
  afterEach(() => vi.unstubAllEnvs());

  it("opens again for the same owner", async () => {
    const sealed = await sealToken(TOKEN, "owner-1");
    expect(sealed).not.toContain(TOKEN);
    expect(await openToken(sealed, "owner-1")).toBe(TOKEN);
  });

  it("seals the same token differently every time", async () => {
    expect(await sealToken(TOKEN, "owner-1")).not.toBe(await sealToken(TOKEN, "owner-1"));
  });

  it("doesn't open for another owner or after tampering", async () => {
    const sealed = await sealToken(TOKEN, "owner-1");
    await expect(openToken(sealed, "owner-2")).rejects.toThrow();
    const [version, iv, data] = sealed.split(".");
    const flipped = (data?.[0] === "A" ? "B" : "A") + (data?.slice(1) ?? "");
    await expect(openToken([version, iv, flipped].join("."), "owner-1")).rejects.toThrow();
  });

  it("doesn't open with another key", async () => {
    const sealed = await sealToken(TOKEN, "owner-1");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
    await expect(openToken(sealed, "owner-1")).rejects.not.toBeInstanceOf(TokenKeyError);
  });

  it("reports a missing or short key as a setup problem", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    await expect(sealToken(TOKEN, "owner-1")).rejects.toBeInstanceOf(TokenKeyError);
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(16, 7).toString("base64"));
    await expect(openToken("v1.a.b", "owner-1")).rejects.toBeInstanceOf(TokenKeyError);
  });
});
