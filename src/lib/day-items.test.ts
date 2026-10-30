import { describe, expect, it } from "vitest";
import { buildDayItems, doneKey } from "./day-items";
import type { CalendarEvent, Task } from "./types";

const DAY = "2026-11-02";

function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    date: DAY,
    time: null,
    endTime: null,
    recurrence: null,
    note: null,
    attachment: null,
    carriedFrom: null,
    ...extra,
  };
}

function event(id: string, start: string | null, end: string | null = null) {
  return { id, title: id, date: DAY, start, end } satisfies CalendarEvent;
}

const titles = (items: { title: string }[]) => items.map((item) => item.title);

describe("buildDayItems", () => {
  const tasks = [
    task("habit", { recurrence: { kind: "daily" }, date: "2026-10-01" }),
    task("late call", { time: "17:00" }),
    task("errand"),
    task("other day", { date: "2026-11-03" }),
    task("timed habit", { recurrence: { kind: "daily" }, time: "08:00" }),
  ];
  const events = [
    event("meeting", "09:30", "10:00"),
    event("birthday", null),
    event("early meeting", "09:30", "09:45"),
    { ...event("tomorrow's event", null), date: "2026-11-03" },
  ];

  it("lists untimed items first, then timed ones in time order", () => {
    expect(titles(buildDayItems(DAY, tasks, events, {}))).toEqual([
      "birthday",
      "errand",
      "habit",
      "timed habit",
      "early meeting",
      "meeting",
      "late call",
    ]);
  });

  it("sinks checked items to the bottom", () => {
    const done = {
      [doneKey("birthday", DAY)]: true,
      [doneKey("timed habit", DAY)]: true,
    } as const;
    const items = buildDayItems(DAY, tasks, events, done);
    expect(titles(items).slice(-2)).toEqual(["birthday", "timed habit"]);
    expect(items.at(-1)?.done).toBe(true);
  });

  it("keeps habit check-offs to their own day", () => {
    const done = { [doneKey("habit", "2026-11-01")]: true } as const;
    const habit = buildDayItems(DAY, tasks, [], done).find(
      (item) => item.id === "habit",
    );
    expect(habit).toMatchObject({ kind: "habit", done: false });
  });

  it("tells events, tasks and habits apart", () => {
    const kinds = Object.fromEntries(
      buildDayItems(DAY, tasks, events, {}).map((item) => [item.id, item.kind]),
    );
    expect(kinds).toMatchObject({
      birthday: "event",
      errand: "task",
      habit: "habit",
    });
  });
});
