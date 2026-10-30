import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInCard } from "./sign-in-card";

export const metadata: Metadata = { title: "Sign in · PlanToMe" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <Suspense>
        <SignInCard />
      </Suspense>
    </main>
  );
}
