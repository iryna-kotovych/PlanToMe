import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/types";
import { rowToTask, taskToRow, toInstant, type TaskRow } from "./rows";

const task: Task = {
  id: "3f1d8a52-0000-4000-8000-000000000001",
  title: "Call the bank",
  date: "2026-10-31",
  time: "15:00",
  endTime: "15:30",
  recurrence: null,
  note: null,
  attachment: null,
  carriedFrom: null,
};

describe("task rows", () => {
  it("stores times as UTC instants", () => {
    // Madrid is UTC+1 in winter and UTC+2 in summer.
    expect(toInstant("2026-10-31", "15:00")).toBe("2026-10-31T14:00:00.000Z");
    expect(toInstant("2026-07-01", "15:00")).toBe("2026-07-01T13:00:00.000Z");
  });

  it("round-trips a timed task", () => {
    const row = taskToRow(task);
    expect(row).toMatchObject({
      starts_at: "2026-10-31T14:00:00.000Z",
      ends_at: "2026-10-31T14:30:00.000Z",
    });
    expect(rowToTask(row)).toEqual(task);
  });

  it("round-trips an untimed habit", () => {
    const habit: Task = {
      ...task,
      time: null,
      endTime: null,
      recurrence: { kind: "weekly", days: [1, 4] },
      carriedFrom: null,
    };
    expect(taskToRow(habit)).toMatchObject({ starts_at: null, ends_at: null });
    expect(rowToTask(taskToRow(habit))).toEqual(habit);
  });

  it("keeps the wall-clock time of a habit that started before a clock change", () => {
    // Started in summer at 08:00; still 08:00 when read back.
    const row = taskToRow({ ...task, date: "2026-07-01", time: "08:00", endTime: null });
    expect(row.starts_at).toBe("2026-07-01T06:00:00.000Z");
    expect(rowToTask(row)?.time).toBe("08:00");
  });

  it("rejects rows that are not valid tasks", () => {
    const broken: TaskRow = { ...taskToRow(task), recurrence: { kind: "hourly" } };
    expect(rowToTask(broken)).toBeNull();
  });
});
