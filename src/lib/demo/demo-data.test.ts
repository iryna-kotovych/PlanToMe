import { describe, expect, it } from "vitest";
import { buildDayItems } from "@/lib/day-items";
import { demoCapture } from "./demo-capture";
import { mockEventsOn } from "./mock-calendar";
import { seedDemoData } from "./seed";

// Monday.
const TODAY = "2026-11-02";

describe("demo sample data", () => {
  it("fills today with events, tasks and habits", () => {
    const { tasks, done } = seedDemoData(TODAY);
    const items = buildDayItems(TODAY, tasks, mockEventsOn(TODAY, TODAY), done);
    const kinds = new Set(items.map((item) => item.kind));
    expect(kinds).toEqual(new Set(["event", "task", "habit"]));
    expect(items.some((item) => item.kind === "event" && item.start === null)).toBe(true);
    expect(items.some((item) => item.kind === "event" && item.start !== null)).toBe(true);
    expect(items.at(-1)).toMatchObject({ title: "Send the invoice", done: true });
  });

  it("shows yesterday's leftover as carried over", () => {
    const { tasks } = seedDemoData(TODAY);
    expect(tasks.find((task) => task.title === "Renew library card")).toMatchObject({
      date: TODAY,
      carriedFrom: "2026-11-01",
    });
  });

  it("has no stand-up on weekends", () => {
    expect(mockEventsOn("2026-11-07", TODAY)).toEqual([]);
  });

  it("turns a picture into two tasks", async () => {
    const result = await demoCapture.fromFile(new File([], "invite.png"), TODAY);
    expect(result.tasks.map((task) => task.date)).toEqual(["2026-11-05", TODAY]);
  });
});
