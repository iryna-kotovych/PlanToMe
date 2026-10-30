import type { Backend } from "@/lib/backend";
import { demoCapture } from "./demo-capture";
import { demoStore, useDemoData } from "./demo-store";
import { mockCalendar } from "./mock-calendar";

export const demoBackend: Backend = {
  useData: useDemoData,
  useSyncStatus: () => "synced",
  toggleDone: demoStore.toggleDone,
  addTasks: demoStore.addTasks,
  updateTask: demoStore.updateTask,
  removeTasks: demoStore.removeTasks,
  carryOver: demoStore.carryOver,
  calendar: mockCalendar,
  capture: demoCapture,
  features: { voice: true, files: true },
};
