import { TodayApp } from "@/components/today/today-app";

// The same screen serves the public demo and the owner's real app; which
// backend it uses is decided by NEXT_PUBLIC_DEMO_MODE at build time.
export default function Home() {
  return <TodayApp />;
}
