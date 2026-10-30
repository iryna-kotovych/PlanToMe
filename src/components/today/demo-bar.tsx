export function DemoBar({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex items-center justify-between pr-3 pl-5">
      <p className="rounded-full bg-line px-2.5 py-1 text-xs font-medium text-muted">
        Demo — sample data
      </p>
      <button
        type="button"
        onClick={onReset}
        className="min-h-11 px-2 text-[13px] font-medium text-muted underline underline-offset-4"
      >
        Reset
      </button>
    </div>
  );
}
