import { useEffect, useEffectEvent, useState, type RefObject } from "react";

/** How far the finger travels down from the top to refresh. */
const PULL_DISTANCE = 110;
/** Movement below this doesn't decide between a pull and a sideways swipe. */
const LOCK_DISTANCE = 10;
/** How far the indicator slides down into view at a full pull. */
const INDICATOR_TRAVEL = 48;

/**
 * Pull down from the top of `scrollRef` to refresh (spec 4.1). While the
 * finger pulls, `indicatorRef` slides into view, fades in and turns.
 * Returns whether a refresh is running.
 */
export function usePullToRefresh(
  scrollRef: RefObject<HTMLElement | null>,
  indicatorRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown>,
): boolean {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useEffectEvent(onRefresh);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    // Typed non-null, for the handlers below.
    const scroller: HTMLElement = element;
    let start: { x: number; y: number } | null = null;
    let pulling = false;
    let progress = 0;
    let busy = false;

    function show(value: number) {
      progress = value;
      const indicator = indicatorRef.current;
      if (!indicator) return;
      indicator.style.opacity = String(value);
      indicator.style.transform = `translateY(${Math.round(value * INDICATOR_TRAVEL)}px) rotate(${Math.round(value * 270)}deg)`;
    }

    function stop() {
      start = null;
      show(0);
    }

    function onTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      pulling = false;
      start =
        !busy && event.touches.length === 1 && touch && scroller.scrollTop <= 0
          ? { x: touch.clientX, y: touch.clientY }
          : null;
      show(0);
    }

    function onTouchMove(event: TouchEvent) {
      const touch = event.touches[0];
      if (!start || !touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!pulling) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_DISTANCE) return;
        // A sideways swipe pages the day instead; scrolling up just scrolls.
        if (Math.abs(dx) > Math.abs(dy) || dy < 0) {
          stop();
          return;
        }
        pulling = true;
      }
      if (dy <= 0 || scroller.scrollTop > 0) {
        stop();
        return;
      }
      show(Math.min(dy / PULL_DISTANCE, 1));
    }

    async function onTouchEnd() {
      if (!start) return;
      start = null;
      const pulled = progress >= 1;
      show(0);
      if (!pulled) return;
      busy = true;
      setRefreshing(true);
      try {
        await refresh();
      } finally {
        busy = false;
        setRefreshing(false);
      }
    }

    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: true });
    element.addEventListener("touchend", onTouchEnd);
    element.addEventListener("touchcancel", stop);
    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", stop);
    };
  }, [scrollRef, indicatorRef]);

  return refreshing;
}
