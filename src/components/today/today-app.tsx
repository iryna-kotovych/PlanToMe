"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useCalendarEvents } from "@/hooks/use-calendar-events";
import { useServiceWorker } from "@/hooks/use-service-worker";
import { useSwipe, type SwipeDirection } from "@/hooks/use-swipe";
import { useToday } from "@/hooks/use-today";
import type { Backend } from "@/lib/backend";
import { toTask, type CaptureResult } from "@/lib/capture/types";
import { cloudBackend } from "@/lib/cloud/cloud-backend";
import { cloudStore } from "@/lib/cloud/cloud-store";
import { addDays, MAX_DAYS_AHEAD, relativeDayLabel } from "@/lib/dates";
import { buildDayItems } from "@/lib/day-items";
import { demoBackend } from "@/lib/demo/demo-backend";
import { demoStore } from "@/lib/demo/demo-store";
import { DEMO_MODE } from "@/lib/env";
import { prefersReducedMotion } from "@/lib/motion";
import type { Attachment, DayItem, Task, TaskData } from "@/lib/types";
import { AccountBar } from "./account-bar";
import { AddBar } from "./add-bar";
import { DayHeader } from "./day-header";
import { DayList } from "./day-list";
import { DemoBar } from "./demo-bar";
import { DemoHint } from "./demo-hint";
import { EventDetails } from "./event-details";
import { Sheet } from "./sheet";
import { PRIMARY_BUTTON } from "./styles";
import { TaskForm } from "./task-form";
import { Toast, type ToastData } from "./toast";

const backend: Backend = DEMO_MODE ? demoBackend : cloudBackend;

type SheetState = { type: "task"; id: string } | { type: "event"; id: string };

export function TodayApp() {
  const today = useToday();
  const data = backend.useData();
  const status = backend.useSyncStatus();
  if (status === "elsewhere") return <OpenElsewhere />;
  if (today === null || data === null) {
    return <div className="h-dvh" aria-busy="true" />;
  }
  return <TodayScreen today={today} data={data} />;
}

/** Shown in a tab when a newer tab took over syncing. */
function OpenElsewhere() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold">PlanToMe is open in another tab</h1>
      <p className="mt-2 text-base text-muted">
        One tab at a time keeps your list in sync.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className={`${PRIMARY_BUTTON} mt-8 max-w-xs`}
      >
        Use it here
      </button>
    </main>
  );
}

function whenLabel(task: Task, today: string): string {
  const day = relativeDayLabel(task.date, today);
  return task.time ? `${day}, ${task.time}` : day;
}

function TodayScreen({ today, data }: { today: string; data: TaskData }) {
  const [offset, setOffset] = useState(0);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const syncStatus = backend.useSyncStatus();
  const scrollRef = useRef<HTMLElement>(null);
  const pagerRef = useRef<HTMLDivElement>(null);
  // The day being animated to, while a page turn is in flight.
  const pendingOffset = useRef<number | null>(null);
  const toastCount = useRef(0);

  const day = addDays(today, offset);
  const events = useCalendarEvents(backend.calendar, today);
  const items = useMemo(
    () => events && buildDayItems(day, data.tasks, events, data.done),
    [day, data, events],
  );

  // Unfinished untimed tasks from past days move to today (spec 5.4).
  useEffect(() => {
    backend.carryOver(today);
  }, [today, data]);

  const showToast = useCallback((next: Omit<ToastData, "id">) => {
    toastCount.current += 1;
    setToast({ ...next, id: toastCount.current });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);
  const closeSheet = useCallback(() => setSheet(null), []);

  useServiceWorker(() =>
    showToast({
      message: "A new version is ready.",
      persistent: true,
      actions: [{ label: "Reload", onClick: () => window.location.reload() }],
    }),
  );

  function currentOffset(): number {
    return pendingOffset.current ?? offset;
  }

  /** Pages to another day with a short slide, or instantly with reduced motion. */
  function goTo(target: number, fromX = 0) {
    const pager = pagerRef.current;
    const from = currentOffset();
    const next = Math.min(Math.max(target, 0), MAX_DAYS_AHEAD);
    if (next === from) {
      pager?.style.removeProperty("transform");
      return;
    }
    const show = () => {
      pendingOffset.current = null;
      flushSync(() => setOffset(next));
      scrollRef.current?.scrollTo({ top: 0 });
    };
    // A second tap mid-animation skips straight to the new day.
    if (!pager || pendingOffset.current !== null || prefersReducedMotion()) {
      pager?.getAnimations().forEach((animation) => animation.cancel());
      pager?.style.removeProperty("transform");
      show();
      return;
    }
    pendingOffset.current = next;
    const direction = next > from ? 1 : -1;
    const leave = pager.animate(
      [
        { transform: `translateX(${fromX}px)`, opacity: 1 },
        { transform: `translateX(${-direction * 30}%)`, opacity: 0 },
      ],
      { duration: 160, easing: "ease-in", fill: "forwards" },
    );
    leave.finished.then(
      () => {
        show();
        pager.style.removeProperty("transform");
        pager.animate(
          [
            { transform: `translateX(${direction * 30}%)`, opacity: 0 },
            { transform: "none", opacity: 1 },
          ],
          { duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        );
        leave.cancel();
      },
      () => undefined,
    );
  }

  function canStep(direction: SwipeDirection): boolean {
    const target = currentOffset() + direction;
    return target >= 0 && target <= MAX_DAYS_AHEAD;
  }

  useSwipe(pagerRef, {
    canSwipe: canStep,
    onSwipe: (direction, offsetX) => goTo(currentOffset() + direction, offsetX),
  });

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (sheet || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest("input, textarea, select, [contenteditable]")
    ) {
      return;
    }
    if (event.key === "ArrowRight") goTo(currentOffset() + 1);
    if (event.key === "ArrowLeft") goTo(currentOffset() - 1);
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  async function capture(
    run: () => Promise<CaptureResult>,
    attachment: Attachment | null = null,
  ) {
    let result: CaptureResult;
    try {
      result = await run();
    } catch {
      showToast({ message: "Couldn't add that. Please try again." });
      return;
    }
    const tasks = result.tasks.map((parsed, index) =>
      toTask(parsed, crypto.randomUUID(), index === 0 ? attachment : null),
    );
    const [first] = tasks;
    if (!first) return;
    backend.addTasks(tasks);
    const details =
      tasks.length === 1
        ? [whenLabel(first, today)]
        : [tasks.map((task) => task.title).join(", ")];
    if (result.transcript) details.push(`Heard: “${result.transcript}”`);
    showToast({
      message:
        tasks.length === 1
          ? `Added “${first.title}”`
          : `Added ${tasks.length} tasks`,
      details,
      actions: [
        {
          label: "Undo",
          onClick: () => backend.removeTasks(tasks.map((task) => task.id)),
        },
        { label: "Edit", onClick: () => setSheet({ type: "task", id: first.id }) },
      ],
    });
  }

  function resetDemo() {
    const previous = demoStore.reset(today);
    goTo(0);
    showToast({
      message: "Sample data restored.",
      actions: [{ label: "Undo", onClick: () => demoStore.replace(previous) }],
    });
  }

  async function signOut() {
    if ((await cloudStore.signOut()) === "failed") {
      showToast({ message: "Couldn't sign out. Check your connection and try again." });
    }
  }

  function deleteTask(task: Task) {
    backend.removeTasks([task.id]);
    closeSheet();
    showToast({
      message: "Task deleted.",
      actions: [{ label: "Undo", onClick: () => backend.addTasks([task]) }],
    });
  }

  function openItem(item: DayItem) {
    setSheet({ type: item.kind === "event" ? "event" : "task", id: item.id });
  }

  const sheetTask =
    sheet?.type === "task"
      ? data.tasks.find((task) => task.id === sheet.id)
      : undefined;
  const sheetEvent =
    sheet?.type === "event"
      ? items?.find((item) => item.kind === "event" && item.id === sheet.id)
      : undefined;

  return (
    <div className="mx-auto flex h-dvh w-full max-w-xl flex-col">
      <header className="shrink-0 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        {DEMO_MODE ? (
          <DemoBar onReset={resetDemo} />
        ) : (
          <AccountBar
            status={syncStatus}
            onSignOut={() => void signOut()}
            onSignIn={cloudStore.signIn}
            onRetry={cloudStore.retry}
          />
        )}
        <DayHeader
          day={day}
          offset={offset}
          onToday={() => goTo(0)}
          onStep={(direction) => goTo(currentOffset() + direction)}
        />
      </header>

      <main
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div ref={pagerRef} className="min-h-full touch-pan-y px-5 pb-6 select-none">
          {DEMO_MODE && <DemoHint />}
          {items && (
            <DayList
              key={day}
              items={items}
              today={today}
              onToggle={(item) => backend.toggleDone(item.id, day)}
              onOpen={openItem}
            />
          )}
        </div>
      </main>

      <AddBar
        voice={backend.features.voice}
        files={backend.features.files}
        onText={(text) => capture(() => backend.capture.fromText(text, today))}
        onVoice={() => capture(() => backend.capture.fromVoice(null, today))}
        onFile={(file) =>
          capture(() => backend.capture.fromFile(file, today), {
            name: file.name,
            type: file.type,
            size: file.size,
          })
        }
      />

      <Toast toast={toast} onDismiss={dismissToast} />

      {sheetTask && (
        <Sheet title="Edit task" onClose={closeSheet}>
          <TaskForm
            key={sheetTask.id}
            task={sheetTask}
            today={today}
            attachments={backend.features.files}
            onSave={(task) => {
              backend.updateTask(task);
              closeSheet();
            }}
            onDelete={deleteTask}
          />
        </Sheet>
      )}
      {sheetEvent && (
        <Sheet title="Calendar event" onClose={closeSheet}>
          <EventDetails
            item={sheetEvent}
            day={day}
            today={today}
            onToggle={() => backend.toggleDone(sheetEvent.id, day)}
          />
        </Sheet>
      )}
    </div>
  );
}
