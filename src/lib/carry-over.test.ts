import { describe, expect, it } from "vitest";
import { carryOver } from "./carry-over";
import { doneKey } from "./day-items";
import type { Task } from "./types";

const TODAY = "2026-11-02";

function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    date: "2026-10-31",
    time: null,
    endTime: null,
    recurrence: null,
    note: null,
    attachment: null,
    carriedFrom: null,
    ...extra,
  };
}

describe("carryOver", () => {
  it("moves an unfinished untimed task to today and remembers its day", () => {
    const [moved] = carryOver([task("errand")], {}, TODAY);
    expect(moved).toMatchObject({ date: TODAY, carriedFrom: "2026-10-31" });
  });

  it("keeps the original day when a task is carried again", () => {
    const [moved] = carryOver(
      [task("errand", { date: "2026-11-01", carriedFrom: "2026-10-30" })],
      {},
      TODAY,
    );
    expect(moved?.carriedFrom).toBe("2026-10-30");
  });

  it("leaves timed, recurring, finished and upcoming tasks alone", () => {
    const tasks = [
      task("timed", { time: "15:00" }),
      task("habit", { recurrence: { kind: "daily" } }),
      task("finished"),
      task("today", { date: TODAY }),
      task("later", { date: "2026-11-05" }),
    ];
    const done = { [doneKey("finished", "2026-10-31")]: true } as const;
    expect(carryOver(tasks, done, TODAY)).toBe(tasks);
  });
});
