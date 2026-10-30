import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignInCard } from "./sign-in-card";

export const metadata: Metadata = { title: "Sign in · PlanToMe" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
      <div className="flex w-full flex-1 items-center justify-center">
        <Suspense>
          <SignInCard />
        </Suspense>
      </div>
      <Link
        href="/privacy"
        className="inline-flex min-h-11 items-center px-3 text-sm text-muted hover:text-ink"
      >
        Privacy policy
      </Link>
    </main>
  );
}
