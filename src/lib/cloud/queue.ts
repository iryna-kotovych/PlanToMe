import { doneKey } from "@/lib/day-items";
import type { Task, TaskData } from "@/lib/types";

/** A change made in the app that the server has not confirmed yet. */
export type Mutation =
  | { type: "saveTask"; task: Task }
  | { type: "deleteTask"; id: string }
  | { type: "setDone"; itemId: string; day: string; done: boolean };

function supersedes(next: Mutation, earlier: Mutation): boolean {
  switch (next.type) {
    case "saveTask":
      return earlier.type === "saveTask" && earlier.task.id === next.task.id;
    case "deleteTask":
      return (
        (earlier.type === "saveTask" && earlier.task.id === next.id) ||
        (earlier.type === "deleteTask" && earlier.id === next.id)
      );
    case "setDone":
      return (
        earlier.type === "setDone" &&
        earlier.itemId === next.itemId &&
        earlier.day === next.day
      );
  }
}

/** Adds a change to the queue, dropping older changes it makes obsolete. */
export function enqueue(queue: Mutation[], mutation: Mutation): Mutation[] {
  return [...queue.filter((earlier) => !supersedes(mutation, earlier)), mutation];
}

export function applyMutation(data: TaskData, mutation: Mutation): TaskData {
  switch (mutation.type) {
    case "saveTask": {
      const exists = data.tasks.some((task) => task.id === mutation.task.id);
      return {
        ...data,
        tasks: exists
          ? data.tasks.map((task) =>
              task.id === mutation.task.id ? mutation.task : task,
            )
          : [...data.tasks, mutation.task],
      };
    }
    case "deleteTask":
      return {
        ...data,
        tasks: data.tasks.filter((task) => task.id !== mutation.id),
      };
    case "setDone": {
      const key = doneKey(mutation.itemId, mutation.day);
      const done = { ...data.done };
      if (mutation.done) done[key] = true;
      else delete done[key];
      return { ...data, done };
    }
  }
}

/** Server data with the not-yet-synced local changes laid on top. */
export function applyPending(data: TaskData, pending: Mutation[]): TaskData {
  return pending.reduce(applyMutation, data);
}
