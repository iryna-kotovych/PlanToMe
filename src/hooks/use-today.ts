import { useSyncExternalStore } from "react";
import { dayKey } from "@/lib/dates";

function subscribe(onChange: () => void) {
  // Notice midnight while the app is open, and when it comes back from the background.
  const timer = window.setInterval(onChange, 30_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

/** Today's day key in the app time zone; null on the server. */
export function useToday(): string | null {
  return useSyncExternalStore(subscribe, () => dayKey(new Date()), () => null);
}
