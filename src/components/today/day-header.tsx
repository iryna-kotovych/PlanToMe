import { formatDayHeader, MAX_DAYS_AHEAD } from "@/lib/dates";
import { IconButton } from "../icon-button";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";

export function DayHeader({
  day,
  offset,
  onToday,
  onStep,
}: {
  day: string;
  /** Days after today, 0 … MAX_DAYS_AHEAD. */
  offset: number;
  onToday: () => void;
  onStep: (direction: 1 | -1) => void;
}) {
  const label = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : " ";
  return (
    <div className="flex items-end gap-0.5 pr-3 pb-2 pl-5">
      <h1 className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onToday}
          className="block min-h-11 w-full rounded-lg text-left"
        >
          <span className="block text-[13px] font-medium tracking-[0.08em] text-muted uppercase">
            {label}
          </span>
          <span className="block truncate text-[26px] leading-tight font-semibold tracking-tight">
            {formatDayHeader(day)}
          </span>
          {offset > 0 && <span className="sr-only">, back to today</span>}
        </button>
      </h1>
      <IconButton
        label="Previous day"
        disabled={offset === 0}
        onClick={() => onStep(-1)}
      >
        <ChevronLeftIcon className="size-5.5" />
      </IconButton>
      <IconButton
        label="Next day"
        disabled={offset === MAX_DAYS_AHEAD}
        onClick={() => onStep(1)}
      >
        <ChevronRightIcon className="size-5.5" />
      </IconButton>
    </div>
  );
}
