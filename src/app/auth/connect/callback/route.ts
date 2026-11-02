import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  CONNECT_REQUEST_TTL_MS,
  connectDoneUrl,
  type ConnectResult,
} from "@/lib/calendar/connect";
import { DEMO_MODE } from "@/lib/env";
import {
  CALENDAR_SCOPE,
  connectCallbackUrl,
  exchangeCode,
  revokeToken,
  type Grant,
} from "@/lib/google/oauth";
import { sealToken } from "@/lib/google/token-crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

const RequestRowSchema = z.object({ user_id: z.string(), created_at: z.string() });

/**
 * Google sends the owner back here after the consent screen. Public: the
 * random state, saved when the owner tapped "Connect", tells whose calendar
 * this is, so it also works in a browser without the app's session.
 */
export async function GET(request: NextRequest) {
  if (DEMO_MODE) return new NextResponse(null, { status: 404 });
  const { origin, searchParams } = request.nextUrl;
  const done = (result: ConnectResult) =>
    NextResponse.redirect(connectDoneUrl(origin, result), {
      headers: { "Cache-Control": "no-store" },
    });

  const state = searchParams.get("state");
  if (!state) return done("expired");
  try {
    const db = supabaseAdmin();
    // Each tap works once.
    const { data, error } = await db
      .from("google_connect_requests")
      .delete()
      .eq("state", state)
      .select("user_id, created_at")
      .maybeSingle();
    if (error) throw error;
    const connect = data === null ? null : RequestRowSchema.parse(data);
    if (!connect || Date.now() - Date.parse(connect.created_at) > CONNECT_REQUEST_TTL_MS) {
      return done("expired");
    }
    // Cancelling or not allowing access comes back as access_denied.
    const googleError = searchParams.get("error");
    if (googleError) return done(googleError === "access_denied" ? "denied" : "error");
    const code = searchParams.get("code");
    if (!code) return done("error");

    const grant = await exchangeCode(code, connectCallbackUrl(origin));
    // Google lets people untick the calendar box on the consent screen. What
    // is left is the sign-in access PlanToMe has anyway, so it stays.
    if (!grant.scopes.includes(CALENDAR_SCOPE)) return done("denied");
    const { data: owner, error: ownerError } = await db.auth.admin.getUserById(connect.user_id);
    if (ownerError) throw ownerError;
    const ownerEmail = owner.user.email?.toLowerCase();
    if (!grant.email || !ownerEmail || grant.email.toLowerCase() !== ownerEmail) {
      await forget(grant);
      return done("wrong-account");
    }
    if (!grant.refreshToken) {
      // Calendar access PlanToMe couldn't keep using: give it back too.
      await forget(grant);
      return done("error");
    }

    const { error: saveError } = await db.from("google_tokens").upsert({
      user_id: connect.user_id,
      refresh_token_encrypted: await sealToken(grant.refreshToken, connect.user_id),
      scope: grant.scopes.join(" "),
    });
    if (saveError) throw saveError;
    return done("connected");
  } catch (error) {
    console.error("Couldn't finish connecting Google Calendar", error);
    return done("error");
  }
}

/** Gives straight back access PlanToMe won't keep. */
function forget(grant: Grant): Promise<void> {
  return revokeToken(grant.refreshToken ?? grant.token);
}
