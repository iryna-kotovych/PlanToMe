import type { CalendarProvider } from "@/lib/calendar/types";
import type { CaptureService } from "@/lib/capture/types";
import type { Task, TaskData } from "@/lib/types";

/** "offline": changes are kept on this device and sent when back online. */
export type SyncStatus = "synced" | "saving" | "offline";

/**
 * Where the day list's data lives: the visitor's browser in the public demo,
 * or Supabase in the owner's real app. Changes apply instantly (optimistic UI).
 */
export interface Backend {
  /** Null until the data has loaded. */
  useData(): TaskData | null;
  useSyncStatus(): SyncStatus;
  toggleDone(id: string, day: string): void;
  addTasks(tasks: Task[]): void;
  updateTask(task: Task): void;
  removeTasks(ids: string[]): void;
  carryOver(today: string): void;
  calendar: CalendarProvider;
  capture: CaptureService;
  /** Input methods this backend supports. */
  features: { voice: boolean; files: boolean };
}
