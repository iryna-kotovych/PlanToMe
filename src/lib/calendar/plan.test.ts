import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/types";
import { eventFor, planCalendarChanges, type CalendarLink } from "./plan";

// Invented tasks. Early November 2026 is winter time in Madrid (UTC+1).
const TODAY = "2026-11-03";
const TODAY_START = "2026-11-02T23:00:00.000Z";

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: "Call the bank",
    date: TODAY,
    time: "15:00",
    endTime: null,
    recurrence: null,
    note: null,
    attachment: null,
    carriedFrom: null,
    ...overrides,
  };
}

const PUSHED = {
  summary: "Call the bank",
  start: "2026-11-03T14:00:00.000Z",
  end: "2026-11-03T14:30:00.000Z",
};

function link(taskId: string, pushed: CalendarLink["pushed"] = PUSHED): CalendarLink {
  return { taskId, eventId: `event-${taskId}`, pushed };
}

function plan(tasks: Task[], links: CalendarLink[], existing: string[] = []) {
  const ids = new Set([...tasks.map((item) => item.id), ...existing]);
  return planCalendarChanges(tasks, ids, links, TODAY, TODAY_START);
}

describe("a task's calendar event", () => {
  it("lasts 30 minutes unless the task has an end", () => {
    expect(eventFor(task("a"))).toEqual(PUSHED);
    expect(eventFor(task("a", { endTime: "16:15" }))?.end).toBe("2026-11-03T15:15:00.000Z");
  });

  it("ends the next morning when the end is before the start", () => {
    expect(eventFor(task("a", { time: "22:00", endTime: "01:00" }))).toMatchObject({
      start: "2026-11-03T21:00:00.000Z",
      end: "2026-11-04T00:00:00.000Z",
    });
  });

  it("only exists for one-off tasks with a time", () => {
    expect(eventFor(task("a", { time: null }))).toBeNull();
    expect(eventFor(task("a", { recurrence: { kind: "daily" } }))).toBeNull();
  });
});

describe("planning calendar changes", () => {
  it("creates an event for a new timed task", () => {
    expect(plan([task("a")], [])).toEqual([
      { type: "create", taskId: "a", eventId: null, event: PUSHED },
    ]);
  });

  it("tries an unconfirmed creation again under the same event id", () => {
    expect(plan([task("a")], [link("a", null)])).toEqual([
      { type: "create", taskId: "a", eventId: "event-a", event: PUSHED },
    ]);
  });

  it("leaves an event alone while its task is unchanged", () => {
    expect(plan([task("a")], [link("a")])).toEqual([]);
  });

  it("updates the event when the task's title or time changes", () => {
    expect(plan([task("a", { title: "Call the bank again", time: "16:00" })], [link("a")])).toEqual([
      {
        type: "update",
        taskId: "a",
        eventId: "event-a",
        event: {
          summary: "Call the bank again",
          start: "2026-11-03T15:00:00.000Z",
          end: "2026-11-03T15:30:00.000Z",
        },
      },
    ]);
  });

  it("removes the event when the task loses its time or starts repeating", () => {
    expect(
      plan(
        [task("a", { time: null }), task("b", { recurrence: { kind: "weekdays" } })],
        [link("a"), link("b")],
      ),
    ).toEqual([
      { type: "delete", taskId: "a", eventId: "event-a" },
      { type: "delete", taskId: "b", eventId: "event-b" },
    ]);
  });

  it("never writes events for untimed tasks or habits", () => {
    expect(plan([task("a", { time: null }), task("b", { recurrence: { kind: "daily" } })], [])).toEqual(
      [],
    );
  });

  it("removes the event of a deleted task", () => {
    expect(plan([], [link("gone"), link("half-made", null)])).toEqual([
      { type: "delete", taskId: "gone", eventId: "event-gone" },
      { type: "delete", taskId: "half-made", eventId: "event-half-made" },
    ]);
  });

  it("leaves past days alone", () => {
    const yesterday = {
      ...PUSHED,
      start: "2026-11-02T14:00:00.000Z",
      end: "2026-11-02T14:30:00.000Z",
    };
    expect(
      plan(
        [task("old", { date: "2026-11-02", title: "Renamed" })],
        [link("old", yesterday), link("deleted-yesterday", yesterday)],
      ),
    ).toEqual([]);
  });

  it("keeps the event of a task that still exists on another day", () => {
    expect(plan([], [link("elsewhere")], ["elsewhere"])).toEqual([]);
  });

  it("takes an upcoming event along when its task moves to a past day", () => {
    expect(plan([task("a", { date: "2026-11-01" })], [link("a")])).toEqual([
      {
        type: "update",
        taskId: "a",
        eventId: "event-a",
        event: {
          summary: "Call the bank",
          start: "2026-11-01T14:00:00.000Z",
          end: "2026-11-01T14:30:00.000Z",
        },
      },
    ]);
  });
});
