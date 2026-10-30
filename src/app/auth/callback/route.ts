import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

/** Google sends the owner back here after sign-in (OAuth code flow). */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const toLogin = (error: string) =>
    NextResponse.redirect(new URL(`/login?error=${error}`, origin));

  const code = searchParams.get("code");
  // Sign-up of any other account is refused before it is created.
  if (searchParams.get("error")) return toLogin("not-allowed");
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
