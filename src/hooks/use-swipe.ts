import { useEffect, useEffectEvent, type RefObject } from "react";

/** 1 = swipe left (next), -1 = swipe right (previous). */
export type SwipeDirection = 1 | -1;

const LOCK_DISTANCE = 10;
const SWIPE_DISTANCE = 60;

/**
 * Horizontal swipes on `ref`. The element follows the finger and resists at
 * the ends; vertical scrolling stays with the browser (pair with
 * `touch-action: pan-y`).
 */
export function useSwipe(
  ref: RefObject<HTMLElement | null>,
  options: {
    canSwipe: (direction: SwipeDirection) => boolean;
    onSwipe: (direction: SwipeDirection, offsetX: number) => void;
  },
) {
  const canSwipe = useEffectEvent(options.canSwipe);
  const onSwipe = useEffectEvent(options.onSwipe);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let start: { x: number; y: number; pointerId: number } | null = null;
    let axis: "x" | "y" | null = null;
    let offsetX = 0;
    let swallowClick = false;

    function onPointerDown(event: PointerEvent) {
      if (!event.isPrimary || event.button !== 0) return;
      start = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      axis = null;
      offsetX = 0;
      swallowClick = false;
    }

    function onPointerMove(event: PointerEvent) {
      if (!start || !element || event.pointerId !== start.pointerId) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (axis === null) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_DISTANCE) return;
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (axis === "x") {
          try {
            element.setPointerCapture(event.pointerId);
          } catch {
            // The pointer is already gone; the swipe still works without capture.
          }
        }
      }
      if (axis !== "x") return;
      offsetX = canSwipe(dx < 0 ? 1 : -1) ? dx : dx / 4;
      element.style.transform = `translateX(${offsetX}px)`;
    }

    function onPointerUp() {
      if (!start || !element) return;
      start = null;
      if (axis !== "x") return;
      // The finger lifted after a swipe: don't treat it as a tap on a row.
      swallowClick = true;
      const direction: SwipeDirection = offsetX < 0 ? 1 : -1;
      if (Math.abs(offsetX) >= SWIPE_DISTANCE && canSwipe(direction)) {
        onSwipe(direction, offsetX);
        return;
      }
      element.style.removeProperty("transform");
      element.animate(
        [{ transform: `translateX(${offsetX}px)` }, { transform: "none" }],
        { duration: 180, easing: "ease-out" },
      );
    }

    function onPointerCancel() {
      start = null;
      element?.style.removeProperty("transform");
    }

    function onClickCapture(event: MouseEvent) {
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    }

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    element.addEventListener("pointercancel", onPointerCancel);
    element.addEventListener("click", onClickCapture, true);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerCancel);
      element.removeEventListener("click", onClickCapture, true);
    };
  }, [ref]);
}
