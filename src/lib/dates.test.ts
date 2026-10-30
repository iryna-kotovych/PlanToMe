import { describe, expect, it } from "vitest";
import {
  addDays,
  dayKey,
  daysBetween,
  formatDayHeader,
  nextWeekday,
  relativeDayLabel,
  weekdayOf,
} from "./dates";

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

describe("day arithmetic", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("is not thrown off by daylight saving changes", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("counts days between two dates", () => {
    expect(daysBetween("2026-10-30", "2026-11-06")).toBe(7);
    expect(daysBetween("2026-11-06", "2026-10-30")).toBe(-7);
  });

  it("finds weekdays", () => {
    expect(weekdayOf("2026-10-30")).toBe(5);
    expect(nextWeekday("2026-10-30", 1)).toBe("2026-11-02");
    // The same weekday means next week, not today.
    expect(nextWeekday("2026-10-30", 5)).toBe("2026-11-06");
  });
});

describe("labels", () => {
  it("formats the header date", () => {
    expect(formatDayHeader("2026-10-30")).toBe("Friday, Oct 30");
  });

  it("names days relative to today", () => {
    expect(relativeDayLabel("2026-10-30", "2026-10-30")).toBe("Today");
    expect(relativeDayLabel("2026-10-31", "2026-10-30")).toBe("Tomorrow");
    expect(relativeDayLabel("2026-11-04", "2026-10-30")).toBe("Wed, Nov 4");
  });
});
