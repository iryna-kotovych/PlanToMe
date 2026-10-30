import { useLayoutEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Slides rows marked with `data-flip-key` from their old position to the new
 * one whenever `signature` changes, e.g. when a checked item sinks down.
 */
export function useFlip(
  container: RefObject<HTMLElement | null>,
  signature: string,
) {
  const positions = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const animate = !prefersReducedMotion();
    const next = new Map<string, number>();
    for (const row of element.querySelectorAll<HTMLElement>("[data-flip-key]")) {
      const key = row.dataset.flipKey;
      if (!key) continue;
      const top = row.offsetTop;
      next.set(key, top);
      const previous = positions.current.get(key);
      if (animate && previous !== undefined && previous !== top) {
        row.animate(
          [{ transform: `translateY(${previous - top}px)` }, { transform: "none" }],
          { duration: 320, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        );
      }
    }
    positions.current = next;
  }, [container, signature]);
}
