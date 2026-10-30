import { TodayApp } from "@/components/today/today-app";
import { DEMO_MODE } from "@/lib/env";

export default function Home() {
  if (DEMO_MODE) return <TodayApp />;

  // The signed-in app arrives in Phase 2; until then only the demo runs.
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">PlanToMe</h1>
      <p className="text-base text-muted">Sign-in is coming soon.</p>
    </main>
  );
}
