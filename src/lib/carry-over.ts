import { doneKey } from "@/lib/day-items";
import type { DoneMarks, Task } from "@/lib/types";

/**
 * Moves unfinished untimed one-off tasks from past days to today (spec 5.4).
 * Timed tasks wait for the wrap-up decision instead, and recurring items
 * never carry over. Returns the same array when nothing moved.
 */
export function carryOver(
  tasks: Task[],
  done: DoneMarks,
  today: string,
): Task[] {
  let moved = false;
  const next = tasks.map((task) => {
    if (
      task.recurrence ||
      task.time !== null ||
      task.date >= today ||
      done[doneKey(task.id, task.date)]
    ) {
      return task;
    }
    moved = true;
    return { ...task, date: today, carriedFrom: task.carriedFrom ?? task.date };
  });
  return moved ? next : tasks;
}
