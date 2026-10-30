import { describe, expect, it } from "vitest";
import type { Task, TaskData } from "@/lib/types";
import { applyPending, enqueue, type Mutation } from "./queue";

function task(id: string, title = id): Task {
  return {
    id,
    title,
    date: "2026-11-02",
    time: null,
    endTime: null,
    recurrence: null,
    note: null,
    attachment: null,
    carriedFrom: null,
  };
}

const empty: TaskData = { tasks: [], done: {} };

describe("enqueue", () => {
  it("keeps only the latest save of a task", () => {
    let queue: Mutation[] = [];
    queue = enqueue(queue, { type: "saveTask", task: task("a", "First") });
    queue = enqueue(queue, { type: "saveTask", task: task("a", "Second") });
    expect(queue).toEqual([{ type: "saveTask", task: task("a", "Second") }]);
  });

  it("drops unsent saves when the task is deleted", () => {
    let queue: Mutation[] = [];
    queue = enqueue(queue, { type: "saveTask", task: task("a") });
    queue = enqueue(queue, { type: "saveTask", task: task("b") });
    queue = enqueue(queue, { type: "deleteTask", id: "a" });
    expect(queue).toEqual([
      { type: "saveTask", task: task("b") },
      { type: "deleteTask", id: "a" },
    ]);
  });

  it("keeps only the last check-off state per item and day", () => {
    let queue: Mutation[] = [];
    queue = enqueue(queue, { type: "setDone", itemId: "a", day: "2026-11-02", done: true });
    queue = enqueue(queue, { type: "setDone", itemId: "a", day: "2026-11-03", done: true });
    queue = enqueue(queue, { type: "setDone", itemId: "a", day: "2026-11-02", done: false });
    expect(queue).toEqual([
      { type: "setDone", itemId: "a", day: "2026-11-03", done: true },
      { type: "setDone", itemId: "a", day: "2026-11-02", done: false },
    ]);
  });
});

describe("applyPending", () => {
  it("lays unsynced changes over what the server sent", () => {
    const server: TaskData = {
      tasks: [task("a", "From server"), task("b")],
      done: { "b@2026-11-02": true },
    };
    const result = applyPending(server, [
      { type: "saveTask", task: task("a", "Edited offline") },
      { type: "saveTask", task: task("c") },
      { type: "deleteTask", id: "b" },
      { type: "setDone", itemId: "b", day: "2026-11-02", done: false },
      { type: "setDone", itemId: "c", day: "2026-11-02", done: true },
    ]);
    expect(result.tasks.map((t) => t.title)).toEqual(["Edited offline", "c"]);
    expect(result.done).toEqual({ "c@2026-11-02": true });
  });

  it("leaves the data alone with nothing pending", () => {
    expect(applyPending(empty, [])).toBe(empty);
  });
});
