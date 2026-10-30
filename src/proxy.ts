import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/env";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

// Runs before every page of the real app: refreshes the Supabase session
// cookie and lets only the owner's account through. The demo is public.

const PUBLIC_PATHS = ["/login", "/privacy", "/auth/"];

export async function proxy(request: NextRequest) {
  if (DEMO_MODE) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // No-cache headers, so no CDN ever stores a response with a session.
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // Verifies the session (and refreshes it if it is about to expire).
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims.email === "string" ? data.claims.email : null;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((prefix) => path.startsWith(prefix));

  const redirectTo = (pathname: string, error?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = error ? `?error=${error}` : "";
    const redirect = NextResponse.redirect(url);
    // Keep any refreshed session cookies, and their no-cache headers.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    ["cache-control", "expires", "pragma"].forEach((key) => {
      const value = response.headers.get(key);
      if (value) redirect.headers.set(key, value);
    });
    return redirect;
  };

  if (email && !isAllowedEmail(email)) {
    await supabase.auth.signOut();
    return isPublic ? response : redirectTo("/login", "not-allowed");
  }
  if (!email && !isPublic) return redirectTo("/login");
  if (email && path === "/login") return redirectTo("/");
  return response;
}

export const config = {
  // Everything except build files, the service worker, icons and other
  // static files the installed app needs before signing in.
  matcher: [
    "/((?!_next/static|_next/image|sw\\.js|manifest\\.webmanifest|version\\.json|icon\\.svg|apple-icon\\.png|icons/|splash/).*)",
  ],
};
