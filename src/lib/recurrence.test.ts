import { describe, expect, it } from "vitest";
import { firstOccurrence, occursOn } from "./recurrence";
import type { Recurrence } from "./types";

// 2026-11-02 is a Monday.
const repeat = (recurrence: Recurrence, date = "2026-11-02") => ({
  date,
  recurrence,
});

describe("occursOn", () => {
  it("shows a one-off task only on its own day", () => {
    const task = { date: "2026-11-02", recurrence: null };
    expect(occursOn(task, "2026-11-02")).toBe(true);
    expect(occursOn(task, "2026-11-03")).toBe(false);
  });

  it("never shows a recurring item before it starts", () => {
    expect(occursOn(repeat({ kind: "daily" }), "2026-11-01")).toBe(false);
    expect(occursOn(repeat({ kind: "daily" }), "2026-11-02")).toBe(true);
    expect(occursOn(repeat({ kind: "daily" }), "2026-12-25")).toBe(true);
  });

  it("repeats on weekdays only", () => {
    const rule = repeat({ kind: "weekdays" });
    expect(occursOn(rule, "2026-11-06")).toBe(true); // Friday
    expect(occursOn(rule, "2026-11-07")).toBe(false); // Saturday
    expect(occursOn(rule, "2026-11-08")).toBe(false); // Sunday
  });

  it("repeats on chosen weekdays", () => {
    const rule = repeat({ kind: "weekly", days: [1, 4] });
    expect(occursOn(rule, "2026-11-05")).toBe(true); // Thursday
    expect(occursOn(rule, "2026-11-04")).toBe(false); // Wednesday
    expect(occursOn(rule, "2026-11-09")).toBe(true); // next Monday
  });

  it("repeats every N days from the start", () => {
    const rule = repeat({ kind: "interval", everyDays: 3 });
    expect(occursOn(rule, "2026-11-05")).toBe(true);
    expect(occursOn(rule, "2026-11-06")).toBe(false);
    expect(occursOn(rule, "2026-11-08")).toBe(true);
  });

  it("repeats monthly, using the last day of shorter months", () => {
    const rule = repeat({ kind: "monthly", dayOfMonth: 31 }, "2026-01-31");
    expect(occursOn(rule, "2026-01-31")).toBe(true);
    expect(occursOn(rule, "2026-02-28")).toBe(true);
    expect(occursOn(rule, "2026-02-27")).toBe(false);
    expect(occursOn(rule, "2026-04-30")).toBe(true);
    expect(occursOn(rule, "2026-05-30")).toBe(false);
  });
});

describe("firstOccurrence", () => {
  it("skips to the first matching day", () => {
    expect(firstOccurrence({ kind: "weekdays" }, "2026-11-07")).toBe(
      "2026-11-09",
    );
    expect(firstOccurrence({ kind: "weekly", days: [4] }, "2026-11-02")).toBe(
      "2026-11-05",
    );
    expect(firstOccurrence({ kind: "daily" }, "2026-11-02")).toBe(
      "2026-11-02",
    );
  });
});
