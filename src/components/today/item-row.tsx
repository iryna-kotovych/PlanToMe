import { daysBetween, formatDay } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { DayItem, ItemKind } from "@/lib/types";
import { Checkbox } from "../checkbox";
import { CalendarIcon, PencilIcon, RepeatIcon } from "../icons";

const KIND_ICONS = {
  event: CalendarIcon,
  task: PencilIcon,
  habit: RepeatIcon,
} satisfies Record<ItemKind, unknown>;

const KIND_LABELS: Record<ItemKind, string> = {
  event: "calendar event",
  task: "task",
  habit: "repeats",
};

/** "from Thu" for the past week, "from Oct 21" before that. */
function carriedLabel(from: string, today: string): string {
  return daysBetween(from, today) <= 6
    ? formatDay(from, "EEE")
    : formatDay(from, "MMM d");
}

export function ItemRow({
  item,
  today,
  onToggle,
  onOpen,
}: {
  item: DayItem;
  today: string;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const KindIcon = KIND_ICONS[item.kind];
  return (
    <li
      data-flip-key={`${item.kind}:${item.id}`}
      className="flex items-start border-b border-line bg-canvas last:border-b-0"
    >
      <div className="-ml-2.5 pt-1.5">
        <Checkbox
          checked={item.done}
          label={`Done: ${item.title}`}
          onToggle={onToggle}
        />
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-14 min-w-0 flex-1 items-start gap-3 py-3.5 pl-1 text-left"
      >
        {item.start !== null && (
          <span className="w-12 shrink-0 text-[15px] leading-6 text-muted tabular-nums">
            {item.start}
            {item.end !== null && (
              <>
                <span className="sr-only"> to </span>
                <span className="block text-[13px] leading-5">{item.end}</span>
              </>
            )}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-lg leading-6 break-words transition-colors duration-200",
              item.done && "text-muted line-through decoration-muted/70",
            )}
          >
            {item.title}
          </span>
          {item.carriedFrom !== null && (
            <span className="mt-0.5 block text-sm text-muted">
              from {carriedLabel(item.carriedFrom, today)}
            </span>
          )}
        </span>
        <KindIcon className="mt-1 size-4 shrink-0 text-muted" />
        <span className="sr-only">, {KIND_LABELS[item.kind]}</span>
      </button>
    </li>
  );
}
