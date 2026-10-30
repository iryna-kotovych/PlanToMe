import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** A round 44px icon button with a required accessible label. */
export function IconButton({
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-line/70 disabled:text-muted/40 disabled:hover:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}
