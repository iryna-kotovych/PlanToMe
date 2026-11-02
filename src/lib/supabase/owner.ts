import "server-only";
import { isAllowedEmail } from "@/lib/auth";
import { supabaseServer } from "./server";

export interface Owner {
  id: string;
  email: string;
}

/** The signed-in owner, checked on the server; null for anyone else. */
export async function signedInOwner(): Promise<Owner | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const email = typeof claims?.email === "string" ? claims.email : null;
  if (!claims?.sub || !email || !isAllowedEmail(email)) return null;
  return { id: claims.sub, email };
}
