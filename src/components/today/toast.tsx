import { useEffect } from "react";

export interface ToastData {
  id: number;
  message: string;
  details?: string[];
  actions?: { label: string; onClick: () => void }[];
  /** Stays until acted on, instead of hiding after a few seconds. */
  persistent?: boolean;
}

const VISIBLE_MS = 6000;

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastData | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast || toast.persistent) return;
    const timer = window.setTimeout(onDismiss, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-10 flex justify-center px-3"
    >
      {toast && (
        <div
          key={toast.id}
          className="pointer-events-auto flex w-full max-w-lg animate-toast-in items-center gap-0.5 rounded-2xl bg-ink py-1.5 pr-1.5 pl-4 text-white shadow-[0_12px_32px_-12px_rgb(20_20_20/0.55)]"
        >
          <div className="min-w-0 flex-1 py-1.5">
            <p className="truncate text-[15px] leading-5 font-medium">
              {toast.message}
            </p>
            {toast.details?.map((line) => (
              <p key={line} className="truncate text-[13px] leading-5 text-white/75">
                {line}
              </p>
            ))}
          </div>
          {toast.actions?.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                onDismiss();
                action.onClick();
              }}
              className="min-h-11 shrink-0 rounded-xl px-3 text-[15px] font-semibold text-accent-light"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
