import { useRef } from "react";
import { useFlip } from "@/hooks/use-flip";
import type { DayItem } from "@/lib/types";
import { ItemRow } from "./item-row";

export function DayList({
  items,
  today,
  onToggle,
  onOpen,
}: {
  items: DayItem[];
  today: string;
  onToggle: (item: DayItem) => void;
  onOpen: (item: DayItem) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  useFlip(
    listRef,
    items.map((item) => `${item.kind}:${item.id}:${item.done}`).join("|"),
  );

  if (items.length === 0) {
    return (
      <p className="py-24 text-center text-base text-muted">
        Nothing planned. Enjoy the day.
      </p>
    );
  }

  return (
    <ul ref={listRef} className="relative">
      {items.map((item) => (
        <ItemRow
          key={`${item.kind}:${item.id}`}
          item={item}
          today={today}
          onToggle={() => onToggle(item)}
          onOpen={() => onOpen(item)}
        />
      ))}
    </ul>
  );
}
