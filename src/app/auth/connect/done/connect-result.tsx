"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PRIMARY_BUTTON } from "@/components/today/styles";
import type { ConnectResult } from "@/lib/calendar/connect";

const RESULTS: Record<ConnectResult, { title: string; text: string }> = {
  connected: {
    title: "Google Calendar is connected",
    text: "Your events now show up in PlanToMe, and tasks with a time appear in your calendar. You can close this page.",
  },
  denied: {
    title: "Google Calendar isn't connected",
    text: "PlanToMe needs to see and add your calendar events. Try again and allow access to Google Calendar.",
  },
  "wrong-account": {
    title: "That's a different Google account",
    text: "Connect the Google account you sign in to PlanToMe with.",
  },
  expired: {
    title: "That took a little too long",
    text: "Please start again from PlanToMe.",
  },
  error: {
    title: "Couldn't connect Google Calendar",
    text: "Something went wrong on the way. Please try again in a moment.",
  },
};

function isResult(value: string | null): value is ConnectResult {
  // Only our own codes: the link could carry anything, even "__proto__".
  return value !== null && Object.hasOwn(RESULTS, value);
}

export function ConnectResultCard() {
  const result = useSearchParams().get("result");
  const { title, text } = RESULTS[isResult(result) ? result : "error"];
  return (
    <div className="w-full max-w-sm text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-base text-muted">{text}</p>
      <Link
        href="/"
        className={`${PRIMARY_BUTTON} mt-8 inline-flex items-center justify-center`}
      >
        Open PlanToMe
      </Link>
    </div>
  );
}
