import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnectResultCard } from "./connect-result";

export const metadata: Metadata = { title: "Google Calendar · PlanToMe" };

/**
 * Where connecting Google Calendar ends. Public, as it can open in a browser
 * that doesn't have the app's session (the Home Screen app on iPhone).
 */
export default function ConnectDonePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
      <Suspense>
        <ConnectResultCard />
      </Suspense>
    </main>
  );
}
