import { describe, expect, it } from "vitest";
import { dayKey } from "./dates";

describe("dayKey", () => {
  it("rolls over at Madrid midnight in winter (UTC+1)", () => {
    expect(dayKey(new Date("2026-10-30T22:59:59Z"))).toBe("2026-10-30");
    expect(dayKey(new Date("2026-10-30T23:00:00Z"))).toBe("2026-10-31");
  });

  it("rolls over at Madrid midnight in summer (UTC+2)", () => {
    expect(dayKey(new Date("2026-07-01T21:59:59Z"))).toBe("2026-07-01");
    expect(dayKey(new Date("2026-07-01T22:00:00Z"))).toBe("2026-07-02");
  });

  it("handles the night the clocks go back", () => {
    // 25 Oct 2026: 03:00 CEST becomes 02:00 CET.
    expect(dayKey(new Date("2026-10-25T00:30:00Z"))).toBe("2026-10-25");
    expect(dayKey(new Date("2026-10-25T22:59:59Z"))).toBe("2026-10-25");
  });
});
