import { carryOver } from "@/lib/carry-over";
import { addDays } from "@/lib/dates";
import { doneKey } from "@/lib/day-items";
import type { DoneMarks, Task } from "@/lib/types";

export interface DemoData {
  tasks: Task[];
  done: DoneMarks;
}

function task(id: string, title: string, date: string, extra: Partial<Task> = {}): Task {
  return {
    id: `seed-${id}`,
    title,
    date,
    time: null,
    endTime: null,
    recurrence: null,
    note: null,
    attachment: null,
    carriedFrom: null,
    ...extra,
  };
}

/** Invented sample tasks and habits around `today`. */
export function seedDemoData(today: string): DemoData {
  const day = (offset: number) => addDays(today, offset);
  const tasks = [
    // Left over from yesterday, to show carry-over.
    task("library", "Renew library card", day(-1)),
    task("flowers", "Buy flowers for Ana", day(0)),
    task("invoice", "Send the invoice", day(0)),
    task("plumber", "Call the plumber", day(0), { time: "11:00" }),
    task("stretch", "Stretch", day(0), {
      time: "08:00",
      recurrence: { kind: "weekdays" },
    }),
    task("read", "Read 10 pages", day(0), { recurrence: { kind: "daily" } }),
    task("plants", "Water the plants", day(0), {
      recurrence: { kind: "interval", everyDays: 3 },
    }),
    task("dry-cleaning", "Pick up dry cleaning", day(1)),
    task("bill", "Pay the electricity bill", day(2)),
    task("trip", "Plan the weekend trip", day(3), {
      note: "Look at trains to the coast.",
    }),
  ];
  const done = { [doneKey("seed-invoice", today)]: true } as const;
  return { tasks: carryOver(tasks, done, today), done };
}
