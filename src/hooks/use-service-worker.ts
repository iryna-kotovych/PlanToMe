import { useEffect, useEffectEvent } from "react";
import { APP_VERSION } from "@/lib/env";

/**
 * Registers the offline service worker and calls `onUpdateAvailable` when the
 * app comes back to the foreground and a newer deployment is live.
 */
export function useServiceWorker(onUpdateAvailable: () => void) {
  const notify = useEffectEvent(onUpdateAvailable);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    // A new version number per deployment installs a fresh worker.
    navigator.serviceWorker
      .register(`/sw.js?v=${APP_VERSION}`, { updateViaCache: "none" })
      .catch(() => undefined);

    let notified = false;
    async function checkForUpdate() {
      if (notified || document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/version.json", { cache: "no-store" });
        const body: unknown = await response.json();
        const version =
          typeof body === "object" && body !== null && "version" in body
            ? body.version
            : null;
        if (typeof version === "string" && version !== APP_VERSION) {
          notified = true;
          notify();
        }
      } catch {
        // Offline: check again next time the app comes back.
      }
    }
    document.addEventListener("visibilitychange", checkForUpdate);
    return () => document.removeEventListener("visibilitychange", checkForUpdate);
  }, []);
}
