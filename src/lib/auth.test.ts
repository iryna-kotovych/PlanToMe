import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedEmail } from "./auth";

describe("isAllowedEmail", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lets only the configured email in, ignoring case", () => {
    vi.stubEnv("ALLOWED_EMAIL", "owner@example.com");
    expect(isAllowedEmail("Owner@Example.com")).toBe(true);
    expect(isAllowedEmail("someone@example.com")).toBe(false);
    expect(isAllowedEmail(null)).toBe(false);
  });

  it("lets nobody in when no email is configured", () => {
    vi.stubEnv("ALLOWED_EMAIL", "");
    expect(isAllowedEmail("owner@example.com")).toBe(false);
    expect(isAllowedEmail("")).toBe(false);
  });
});
