"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PRIMARY_BUTTON } from "@/components/today/styles";
import { supabaseBrowser } from "@/lib/supabase/client";

const ERRORS: Record<string, string> = {
  "not-allowed": "This PlanToMe is private, and that account isn't the owner's.",
  "sign-in": "Signing in didn't work. Please try again.",
};

export function SignInCard() {
  const error = useSearchParams().get("error");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setBusy(true);
    setFailed(false);
    const { error: signInError } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser is already on its way to Google.
    if (signInError) {
      setBusy(false);
      setFailed(true);
    }
  }

  // Only our own codes: the link could carry anything, even "__proto__".
  const known = error !== null && Object.hasOwn(ERRORS, error) ? ERRORS[error] : null;
  const message = failed ? ERRORS["sign-in"] : known;

  return (
    <div className="w-full max-w-sm text-center">
      <h1 className="text-3xl font-semibold tracking-tight">PlanToMe</h1>
      <p className="mt-2 text-base text-muted">Your calm daily list.</p>
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className={`${PRIMARY_BUTTON} mt-10 disabled:opacity-70`}
      >
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {message && (
        <p role="alert" className="mt-4 text-sm text-ink">
          {message}
        </p>
      )}
    </div>
  );
}
