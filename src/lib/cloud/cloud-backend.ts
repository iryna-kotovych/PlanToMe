import type { Backend } from "@/lib/backend";
import type { CalendarProvider } from "@/lib/calendar/types";
import { quickParse } from "@/lib/capture/quick-parse";
import type { CaptureService } from "@/lib/capture/types";
import { cloudStore, useCloudData, useCloudSyncStatus } from "./cloud-store";

// Google Calendar arrives in Phase 3; until then the list has no events.
const noCalendar: CalendarProvider = {
  async listEvents() {
    return [];
  },
};

// Until the AI parser arrives (Phase 4), typed text is understood on the
// device by the same rule-based parser as the demo; it also works offline.
const localCapture: CaptureService = {
  async fromText(text, today) {
    return { tasks: quickParse(text, today) };
  },
  async fromVoice() {
    throw new Error("Voice input is not available yet");
  },
  async fromFile() {
    throw new Error("Attachments are not available yet");
  },
};

export const cloudBackend: Backend = {
  useData: useCloudData,
  useSyncStatus: useCloudSyncStatus,
  toggleDone: cloudStore.toggleDone,
  addTasks: cloudStore.addTasks,
  updateTask: cloudStore.updateTask,
  removeTasks: cloudStore.removeTasks,
  carryOver: cloudStore.carryOver,
  calendar: noCalendar,
  capture: localCapture,
  features: { voice: false, files: false },
};
