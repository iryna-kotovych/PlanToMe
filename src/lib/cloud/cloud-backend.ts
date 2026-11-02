import type { Backend } from "@/lib/backend";
import { quickParse } from "@/lib/capture/quick-parse";
import type { CaptureService } from "@/lib/capture/types";
import { cloudCalendar } from "./calendar-store";
import { cloudStore, useCloudData, useCloudSyncStatus } from "./cloud-store";

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
  calendar: cloudCalendar,
  capture: localCapture,
  features: { voice: false, files: false },
};
