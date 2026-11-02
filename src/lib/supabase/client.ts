import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

/** A request the network never answers fails after this, so it can be retried. */
const REQUEST_TIMEOUT_MS = 15_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let signal: AbortSignal = timeout;
  if (init?.signal) {
    // Older browsers can't combine signals; the caller's own then wins.
    signal = "any" in AbortSignal ? AbortSignal.any([init.signal, timeout]) : init.signal;
  }
  return fetch(input, { ...init, signal });
}

let client: SupabaseClient | undefined;

/** The browser's Supabase client, signed in through the session cookies. */
export function supabaseBrowser(): SupabaseClient {
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: fetchWithTimeout },
  });
  return client;
}
