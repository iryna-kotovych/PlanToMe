import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "../icon-button";
import { ArrowUpIcon, MicIcon, PaperclipIcon, StopIcon } from "../icons";
import { ACCENT_FILL } from "./styles";

type Mode = "idle" | "recording" | "working";

/** Holding the mic at least this long means "release to stop". */
const HOLD_TO_TALK_MS = 450;

const ROUND_BUTTON = cn(
  "grid size-12 shrink-0 place-items-center rounded-full shadow-[0_6px_16px_-6px_rgb(255_122_47/0.7)] transition-transform select-none active:scale-95 disabled:opacity-70 [-webkit-touch-callout:none]",
  ACCENT_FILL,
);

function formatSeconds(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The fixed bottom bar: attach, type, or record (spec 4.2). */
export function AddBar({
  voice,
  files,
  onText,
  onVoice,
  onFile,
}: {
  /** Whether recording and attaching are available yet. */
  voice: boolean;
  files: boolean;
  onText: (text: string) => Promise<void>;
  onVoice: () => Promise<void>;
  onFile: (file: File) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [seconds, setSeconds] = useState(0);
  const pressStartedAt = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== "recording") return;
    const startedAt = Date.now();
    const timer = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      250,
    );
    return () => window.clearInterval(timer);
  }, [mode]);

  async function run(job: () => Promise<void>) {
    setMode("working");
    try {
      await job();
    } finally {
      setMode("idle");
    }
  }

  function startRecording() {
    setSeconds(0);
    setMode("recording");
  }

  function stopRecording() {
    void run(onVoice);
  }

  // Tap to start and tap again to stop, or press, hold, and release.
  function onMicPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (mode === "idle") {
      pressStartedAt.current = event.timeStamp;
      startRecording();
    } else if (mode === "recording") {
      pressStartedAt.current = null;
      stopRecording();
    }
  }

  function onMicPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const startedAt = pressStartedAt.current;
    pressStartedAt.current = null;
    if (startedAt !== null && event.timeStamp - startedAt >= HOLD_TO_TALK_MS) {
      stopRecording();
    }
  }

  function onMicClick(event: MouseEvent<HTMLButtonElement>) {
    // Keyboard activation has no pointer events.
    if (event.detail !== 0) return;
    if (mode === "idle") startRecording();
    else if (mode === "recording") stopRecording();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!value || mode !== "idle") return;
    setText("");
    void run(() => onText(value));
  }

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void run(() => onFile(file));
  }

  const hasText = text.trim().length > 0;
  const showMic = voice && !(hasText && mode === "idle");
  const spinner = (
    <span
      aria-hidden="true"
      className="size-5 animate-spin rounded-full border-2 border-ink/25 border-t-ink"
    />
  );

  return (
    <form
      onSubmit={submit}
      className={cn(
        "shrink-0 border-t border-line bg-canvas pt-2 pr-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]",
        files ? "pl-1.5" : "pl-3",
      )}
    >
      <div className="flex items-center gap-1.5">
        {files && (
          <>
            <IconButton
              label="Attach a photo or file"
              disabled={mode !== "idle"}
              onClick={() => fileInput.current?.click()}
            >
              <PaperclipIcon className="size-5.5" />
            </IconButton>
            <input
              ref={fileInput}
              type="file"
              accept="image/*,application/pdf"
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
              onChange={pickFile}
            />
          </>
        )}

        {mode === "recording" ? (
          <p
            role="status"
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-line bg-white px-4 text-base"
          >
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 animate-pulse rounded-full bg-accent"
            />
            Recording {formatSeconds(seconds)}
            <span className="ml-auto truncate text-sm text-muted">
              tap to stop
            </span>
          </p>
        ) : (
          <input
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label="New task"
            placeholder={mode === "working" ? "Working on it…" : "Add a task…"}
            disabled={mode === "working"}
            enterKeyHint="send"
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-base text-ink placeholder:text-muted"
          />
        )}

        {!showMic ? (
          <button
            type="submit"
            aria-label={mode === "working" ? "Working on it" : "Add task"}
            disabled={!hasText || mode !== "idle"}
            className={ROUND_BUTTON}
          >
            {mode === "working" ? (
              spinner
            ) : (
              <ArrowUpIcon className="size-5.5" strokeWidth={2.2} />
            )}
          </button>
        ) : (
          <button
            type="button"
            aria-label={
              mode === "recording"
                ? "Stop recording"
                : mode === "working"
                  ? "Working on it"
                  : "Record a task"
            }
            disabled={mode === "working"}
            onPointerDown={onMicPointerDown}
            onPointerUp={onMicPointerUp}
            onPointerCancel={() => {
              pressStartedAt.current = null;
            }}
            onClick={onMicClick}
            className={ROUND_BUTTON}
          >
            {mode === "working" ? (
              spinner
            ) : mode === "recording" ? (
              <StopIcon className="size-5" />
            ) : (
              <MicIcon className="size-5.5" />
            )}
          </button>
        )}
      </div>
    </form>
  );
}
