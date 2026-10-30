import type { SyncStatus } from "@/lib/backend";

const STATUS_TEXT: Record<SyncStatus, string | null> = {
  synced: null,
  saving: "Saving…",
  offline: "Offline · changes are kept on this device",
};

export function AccountBar({
  status,
  onSignOut,
}: {
  status: SyncStatus;
  onSignOut: () => void;
}) {
  const text = STATUS_TEXT[status];
  return (
    <div className="flex items-center justify-between gap-3 pr-3 pl-5">
      <p role="status" className="min-w-0 truncate text-xs font-medium text-muted">
        {text}
      </p>
      <button
        type="button"
        onClick={onSignOut}
        className="min-h-11 shrink-0 px-2 text-[13px] font-medium text-muted underline underline-offset-4"
      >
        Sign out
      </button>
    </div>
  );
}
