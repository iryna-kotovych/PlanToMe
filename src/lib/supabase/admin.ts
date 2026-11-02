import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

let client: SupabaseClient | undefined;

/**
 * Supabase with the secret key, which bypasses Row Level Security. Server
 * only: for the tables the browser must never read (Google tokens, calendar
 * links) and the calendar work on the owner's tasks. Every query filters by
 * the owner's id, checked beforehand.
 */
export function supabaseAdmin(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  client ??= createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
