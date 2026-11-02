import type { SyncStatus } from "@/lib/backend";

const STATUS_TEXT: Record<SyncStatus, string | null> = {
  synced: null,
  saving: "Saving…",
  offline: "Offline · changes are kept on this device",
  stuck: "Couldn't save · kept on this device",
  signedOut: "Signed out · changes are kept on this device",
  elsewhere: null,
};

const TEXT_BUTTON =
  "min-h-11 shrink-0 px-2 text-[13px] font-medium text-muted underline underline-offset-4";

export function AccountBar({
  status,
  onSignOut,
  onSignIn,
  onRetry,
}: {
  status: SyncStatus;
  onSignOut: () => void;
  onSignIn: () => void;
  onRetry: () => void;
}) {
  const text = STATUS_TEXT[status];
  return (
    <div className="flex items-center justify-between gap-1 pr-3 pl-5">
      <p role="status" className="min-w-0 truncate text-xs font-medium text-muted">
        {text}
      </p>
      <div className="flex shrink-0 items-center">
        {status === "stuck" && (
          <button type="button" onClick={onRetry} className={TEXT_BUTTON}>
            Retry
          </button>
        )}
        {status === "signedOut" ? (
          <button type="button" onClick={onSignIn} className={TEXT_BUTTON}>
            Sign in
          </button>
        ) : (
          <button type="button" onClick={onSignOut} className={TEXT_BUTTON}>
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}
