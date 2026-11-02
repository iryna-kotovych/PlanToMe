import { useId, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { dayOfMonth, weekdayOf } from "@/lib/dates";
import {
  NOTE_MAX,
  TITLE_MAX,
  type Attachment,
  type Recurrence,
  type Task,
} from "@/lib/types";
import { ChevronDownIcon, PaperclipIcon, TrashIcon } from "../icons";
import { ACCENT_FILL, FIELD, FIELD_LABEL, PRIMARY_BUTTON } from "./styles";

type RepeatKind = "none" | Recurrence["kind"];

const REPEAT_LABELS: Record<RepeatKind, string> = {
  none: "Never",
  daily: "Every day",
  weekdays: "Weekdays",
  weekly: "On chosen days",
  interval: "Every few days",
  monthly: "Monthly",
};

// Monday first; 0 = Sunday.
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function TaskForm({
  task,
  today,
  attachments,
  onSave,
  onDelete,
}: {
  task: Task;
  today: string;
  /** Whether files can be attached yet. */
  attachments: boolean;
  onSave: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(task.title);
  const [date, setDate] = useState(task.date);
  const [time, setTime] = useState(task.time ?? "");
  const [endTime, setEndTime] = useState(task.endTime ?? "");
  const [repeat, setRepeat] = useState<RepeatKind>(
    task.recurrence?.kind ?? "none",
  );
  const [weekDays, setWeekDays] = useState(
    task.recurrence?.kind === "weekly"
      ? task.recurrence.days
      : [weekdayOf(task.date)],
  );
  const [everyDays, setEveryDays] = useState(
    task.recurrence?.kind === "interval" ? task.recurrence.everyDays : 2,
  );
  const [note, setNote] = useState(task.note ?? "");
  const [attachment, setAttachment] = useState<Attachment | null>(
    task.attachment,
  );
  const [error, setError] = useState<string | null>(null);

  function recurrence(): Recurrence | null {
    switch (repeat) {
      case "none":
        return null;
      case "daily":
      case "weekdays":
        return { kind: repeat };
      case "weekly":
        return {
          kind: "weekly",
          days: weekDays.length > 0 ? weekDays : [weekdayOf(date)],
        };
      case "interval":
        return {
          kind: "interval",
          everyDays: Math.min(Math.max(Math.round(everyDays) || 2, 2), 365),
        };
      case "monthly":
        return { kind: "monthly", dayOfMonth: dayOfMonth(date) };
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Give the task a title.");
      return;
    }
    if (!date) {
      setError("Pick a day.");
      return;
    }
    if (time && endTime === time) {
      setError("The end time can't be the same as the start time.");
      return;
    }
    const sameUntimedDay = date === task.date && !time;
    onSave({
      ...task,
      title: trimmed,
      date,
      time: time || null,
      endTime: time && endTime ? endTime : null,
      recurrence: recurrence(),
      note: note.trim() || null,
      attachment,
      carriedFrom: sameUntimedDay ? task.carriedFrom : null,
    });
  }

  function toggleWeekDay(day: number) {
    setWeekDays((days) =>
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day],
    );
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      className="space-y-5 px-5 pt-1 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
    >
      <div>
        <label htmlFor={`${id}-title`} className={FIELD_LABEL}>
          Title
        </label>
        <input
          id={`${id}-title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={TITLE_MAX}
          autoComplete="off"
          className={FIELD}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-date`} className={FIELD_LABEL}>
            {repeat === "none" ? "Date" : "Starts"}
          </label>
          <input
            id={`${id}-date`}
            type="date"
            value={date}
            min={repeat === "none" ? today : undefined}
            onChange={(event) => setDate(event.target.value)}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor={`${id}-time`} className={FIELD_LABEL}>
            Time
          </label>
          <input
            id={`${id}-time`}
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className={FIELD}
          />
        </div>
      </div>

      {time && (
        <div className="grid grid-cols-2 items-end gap-3">
          <div>
            <label htmlFor={`${id}-end`} className={FIELD_LABEL}>
              Ends (optional)
            </label>
            <input
              id={`${id}-end`}
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              aria-describedby={endTime && endTime < time ? `${id}-next-day` : undefined}
              className={FIELD}
            />
            {endTime && endTime < time && (
              <p id={`${id}-next-day`} className="mt-1.5 text-sm text-muted">
                Ends the next day.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setTime("");
              setEndTime("");
            }}
            className="min-h-12 text-left text-base text-muted underline underline-offset-4"
          >
            No time
          </button>
        </div>
      )}

      <div>
        <label htmlFor={`${id}-repeat`} className={FIELD_LABEL}>
          Repeat
        </label>
        <div className="relative">
          <select
            id={`${id}-repeat`}
            value={repeat}
            onChange={(event) => setRepeat(event.target.value as RepeatKind)}
            className={cn(FIELD, "appearance-none pr-11")}
          >
            {Object.entries(REPEAT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-muted" />
        </div>
        {repeat === "weekly" && (
          <div
            role="group"
            aria-label="Days of the week"
            className="mt-2.5 flex justify-between"
          >
            {WEEK.map((day) => {
              const on = weekDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  aria-label={WEEKDAY_NAMES[day]}
                  onClick={() => toggleWeekDay(day)}
                  className={cn(
                    "size-11 rounded-full text-sm font-semibold",
                    on ? ACCENT_FILL : "border border-line bg-white text-muted",
                  )}
                >
                  {WEEKDAY_NAMES[day]?.charAt(0)}
                </button>
              );
            })}
          </div>
        )}
        {repeat === "interval" && (
          <div className="mt-2.5 flex items-center gap-2.5 text-base">
            <span>Every</span>
            <div className="w-20">
              <input
                type="number"
                inputMode="numeric"
                min={2}
                max={365}
                value={everyDays}
                onChange={(event) => setEveryDays(Number(event.target.value))}
                aria-label="Number of days"
                className={cn(FIELD, "text-center")}
              />
            </div>
            <span>days</span>
          </div>
        )}
        {repeat === "monthly" && date && (
          <p className="mt-2 text-sm text-muted">
            On day {dayOfMonth(date)} of every month.
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${id}-note`} className={FIELD_LABEL}>
          Note
        </label>
        <textarea
          id={`${id}-note`}
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={NOTE_MAX}
          className={cn(FIELD, "resize-none")}
        />
      </div>

      {attachments && (
        <div>
          <span className={FIELD_LABEL}>Attachment</span>
          {attachment ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-white py-1 pr-1 pl-3.5">
              <PaperclipIcon className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-base">
                {attachment.name}
              </span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="min-h-11 px-3 text-sm font-medium text-muted"
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-base text-muted">
              <PaperclipIcon className="size-5" />
              Add a photo or file
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    setAttachment({ name: file.name, type: file.type, size: file.size });
                  }
                }}
              />
            </label>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onDelete(task)}
          className="flex min-h-12 items-center gap-1.5 rounded-full px-3 text-base text-muted"
        >
          <TrashIcon className="size-5" />
          Delete
        </button>
        <button type="submit" className={cn(PRIMARY_BUTTON, "ml-auto w-auto")}>
          Save
        </button>
      </div>
    </form>
  );
}
