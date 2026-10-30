import { useState, useSyncExternalStore } from "react";
import { IconButton } from "../icon-button";
import { CloseIcon } from "../icons";

const DISMISSED_KEY = "plantome.demo.hint-dismissed";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** A one-time tip for first-time demo visitors. */
export function DemoHint() {
  const dismissedBefore = useSyncExternalStore(subscribe, wasDismissed, () => true);
  const [closed, setClosed] = useState(false);
  if (dismissedBefore || closed) return null;

  function dismiss() {
    setClosed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Storage blocked: the tip just shows again next time.
    }
  }

  return (
    <section
      aria-labelledby="demo-hint-title"
      className="mt-1 mb-3 flex items-start gap-1 rounded-2xl border border-line bg-white py-3 pr-1.5 pl-4"
    >
      <div className="min-w-0 flex-1 pt-0.5">
        <h2 id="demo-hint-title" className="text-[15px] font-semibold">
          Welcome to the demo
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Swipe left for the coming days. Type something like “call mom
          tomorrow at 6pm”, or try the mic and the paperclip: they answer with
          examples. Nothing leaves this browser.
        </p>
      </div>
      <IconButton label="Dismiss tip" onClick={dismiss}>
        <CloseIcon className="size-5" />
      </IconButton>
    </section>
  );
}
