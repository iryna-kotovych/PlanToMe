import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

/** Google sends the owner back here after sign-in (OAuth code flow). */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const toLogin = (error: string) =>
    NextResponse.redirect(new URL(`/login?error=${error}`, origin));

  // Cancelling at Google arrives as an error too, so only the sign-up hook's
  // own refusal means "not the owner's account".
  if (searchParams.get("error")) {
    return toLogin(isRefusedAccount(searchParams) ? "not-allowed" : "sign-in");
  }
  const code = searchParams.get("code");
  if (!code) return toLogin("sign-in");

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return toLogin("sign-in");
  if (!isAllowedEmail(data.user.email)) {
    await supabase.auth.signOut();
    return toLogin("not-allowed");
  }
  return NextResponse.redirect(new URL("/", origin));
}

/**
 * Supabase passes on the message of private.before_user_created (see the
 * allow_only_owner_sign_up migration) when it refuses an account.
 */
function isRefusedAccount(params: URLSearchParams): boolean {
  return (
    params.get("error_code") === "signup_disabled" ||
    /PlanToMe is private/i.test(params.get("error_description") ?? "")
  );
}
