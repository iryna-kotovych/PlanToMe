import { useSyncExternalStore } from "react";
import { z } from "zod";
import { carryOver } from "@/lib/carry-over";
import { dayKey } from "@/lib/dates";
import { doneKey } from "@/lib/day-items";
import { TaskSchema, type Task } from "@/lib/types";
import { seedDemoData, type DemoData } from "./seed";

// Demo data lives only in the visitor's browser (spec 7).

const STORAGE_KEY = "plantome.demo.v1";

const DemoDataSchema = z.object({
  tasks: z.array(TaskSchema),
  done: z.record(z.string(), z.literal(true)),
});

let current: DemoData | null = null;
const listeners = new Set<() => void>();

function load(): DemoData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = DemoDataSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    }
  } catch {
    // Blocked or corrupt storage: start again from the sample data.
  }
  return seedDemoData(dayKey(new Date()));
}

function getSnapshot(): DemoData {
  current ??= load();
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Keep several open tabs in sync.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    current = load();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function commit(next: DemoData) {
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or full storage: keep working in memory.
  }
  listeners.forEach((listener) => listener());
}

function update(change: (data: DemoData) => DemoData) {
  const previous = getSnapshot();
  const next = change(previous);
  if (next !== previous) commit(next);
}

/** Null until the browser has loaded the data (and always on the server). */
export function useDemoData(): DemoData | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export const demoStore = {
  toggleDone(id: string, day: string) {
    update((data) => {
      const key = doneKey(id, day);
      const { [key]: wasDone, ...rest } = data.done;
      return { ...data, done: wasDone ? rest : { ...rest, [key]: true } };
    });
  },
  addTasks(tasks: Task[]) {
    update((data) => ({ ...data, tasks: [...data.tasks, ...tasks] }));
  },
  updateTask(task: Task) {
    update((data) => ({
      ...data,
      tasks: data.tasks.map((existing) =>
        existing.id === task.id ? task : existing,
      ),
    }));
  },
  removeTasks(ids: string[]) {
    update((data) => ({
      ...data,
      tasks: data.tasks.filter((task) => !ids.includes(task.id)),
    }));
  },
  carryOver(today: string) {
    update((data) => {
      const tasks = carryOver(data.tasks, data.done, today);
      return tasks === data.tasks ? data : { ...data, tasks };
    });
  },
  /** Restores the sample data and returns what was there, for undo. */
  reset(today: string): DemoData {
    const previous = getSnapshot();
    commit(seedDemoData(today));
    return previous;
  },
  replace(data: DemoData) {
    commit(data);
  },
};
