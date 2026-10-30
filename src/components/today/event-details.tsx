import { formatTimeRange, relativeDayLabel } from "@/lib/dates";
import type { DayItem } from "@/lib/types";
import { CalendarIcon } from "../icons";
import { PRIMARY_BUTTON } from "./styles";

/** Calendar events are read-only: the app never changes them (spec 5.1). */
export function EventDetails({
  item,
  day,
  today,
  onToggle,
}: {
  item: DayItem;
  day: string;
  today: string;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-5 px-5 pt-1 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
      <div>
        <p className="text-xl leading-snug font-semibold">{item.title}</p>
        <p className="mt-1 text-base text-muted">
          {relativeDayLabel(day, today)} ·{" "}
          {item.start ? formatTimeRange(item.start, item.end) : "All day"}
        </p>
      </div>
      <p className="flex gap-2.5 rounded-xl border border-line bg-white p-3.5 text-sm leading-relaxed text-muted">
        <CalendarIcon className="mt-0.5 size-4 shrink-0" />
        From your calendar. Checking it off only changes PlanToMe, never the
        calendar.
      </p>
      <button type="button" onClick={onToggle} className={PRIMARY_BUTTON}>
        {item.done ? "Mark as not done" : "Mark as done"}
      </button>
    </div>
  );
}
