import { addDays } from "@/lib/dates";
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
      checkedOffSince(task, done, today)
    ) {
      return task;
    }
    moved = true;
    return { ...task, date: today, carriedFrom: task.carriedFrom ?? task.date };
  });
  return moved ? next : tasks;
}

/**
 * Whether the task was checked off on its day or any later past day. Offline,
 * the real app shows a carried task on the new day before the database has
 * moved it, so its check-off can land on that later day (same rule as
 * public.carry_over()).
 */
function checkedOffSince(task: Task, done: DoneMarks, today: string): boolean {
  for (let day = task.date; day < today; day = addDays(day, 1)) {
    if (done[doneKey(task.id, day)]) return true;
  }
  return false;
}
