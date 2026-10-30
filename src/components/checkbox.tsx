import { cn } from "@/lib/cn";
import { CheckIcon } from "./icons";

/** Round checkbox with a soft orange fill when checked; 44px tap target. */
export function Checkbox({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className="grid size-11 shrink-0 place-items-center rounded-full"
    >
      <span
        className={cn(
          "grid size-6.5 place-items-center rounded-full border-[1.5px] transition-colors duration-200",
          checked
            ? "border-transparent bg-linear-to-br from-accent to-accent-light text-white"
            : "border-muted text-transparent",
        )}
      >
        <CheckIcon className="size-4" strokeWidth={2.6} />
      </span>
    </button>
  );
}
