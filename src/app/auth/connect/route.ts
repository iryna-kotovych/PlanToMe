import { NextResponse, type NextRequest } from "next/server";
import { CONNECT_REQUEST_TTL_MS, connectDoneUrl } from "@/lib/calendar/connect";
import { DEMO_MODE } from "@/lib/env";
import { connectCallbackUrl, consentUrl } from "@/lib/google/oauth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { signedInOwner } from "@/lib/supabase/owner";

function redirect(url: string | URL) {
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}

/** "Connect Google Calendar": sends the owner to Google's consent screen. */
export async function GET(request: NextRequest) {
  // The public demo never talks to Google.
  if (DEMO_MODE) return new NextResponse(null, { status: 404 });
  const { origin } = request.nextUrl;
  const owner = await signedInOwner();
  if (!owner) return redirect(new URL("/login", origin));

  const state = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  try {
    const db = supabaseAdmin();
    // Taps that never came back from Google aren't needed any more.
    const cutoff = new Date(Date.now() - CONNECT_REQUEST_TTL_MS).toISOString();
    await db
      .from("google_connect_requests")
      .delete()
      .eq("user_id", owner.id)
      .lt("created_at", cutoff);
    const { error } = await db
      .from("google_connect_requests")
      .insert({ state, user_id: owner.id });
    if (error) throw error;
    return redirect(consentUrl(state, connectCallbackUrl(origin)));
  } catch (error) {
    console.error("Couldn't start connecting Google Calendar", error);
    return redirect(connectDoneUrl(origin, "error"));
  }
}
