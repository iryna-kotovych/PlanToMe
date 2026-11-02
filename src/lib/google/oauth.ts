import "server-only";
import { z } from "zod";

// Connecting Google Calendar with Google's OAuth flow for web server apps
// (developers.google.com/identity/protocols/oauth2/web-server). It all runs
// on the server: the tokens never reach the browser.

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const TIMEOUT_MS = 10_000;

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().default(""),
  id_token: z.string().optional(),
});

const IdTokenClaimsSchema = z.object({
  email: z.string(),
  email_verified: z.union([z.boolean(), z.string()]).optional(),
});

const TokenErrorSchema = z.object({ error: z.string() });

/** Google no longer accepts the refresh token (revoked, or expired). */
export class GoogleGrantError extends Error {}

export interface AccessToken {
  token: string;
  /** Milliseconds since the epoch. */
  expiresAt: number;
}

export interface Grant extends AccessToken {
  refreshToken: string | null;
  scopes: string[];
  /** The connected Google account's email, when Google verified it. */
  email: string | null;
}

function credentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");
  return { clientId, clientSecret };
}

function postForm(url: string, body: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
}

/** Where Google sends the owner back after the consent screen. */
export function connectCallbackUrl(origin: string): string {
  return new URL("/auth/connect/callback", origin).toString();
}

/** Google's consent screen, asking for lasting access to calendar events. */
export function consentUrl(state: string, redirectUri: string): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: credentials().clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // The email tells which account was connected: it must be the owner's.
    scope: `openid email ${CALENDAR_SCOPE}`,
    // A refresh token, so the calendar syncs without asking again.
    access_type: "offline",
    // Ask every time, so Google always sends a new refresh token.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return url.toString();
}

/**
 * The email in an ID token that came straight from Google's token endpoint
 * over HTTPS, so its signature needn't be checked again.
 */
function verifiedEmail(idToken: string): string | null {
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const claims = IdTokenClaimsSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    const verified = claims.email_verified === true || claims.email_verified === "true";
    return verified ? claims.email : null;
  } catch {
    return null;
  }
}

export async function exchangeCode(code: string, redirectUri: string): Promise<Grant> {
  const { clientId, clientSecret } = credentials();
  const response = await postForm(TOKEN_URL, {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (!response.ok) throw new Error(`Google code exchange failed (${response.status})`);
  const tokens = TokenResponseSchema.parse(await response.json());
  return {
    token: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    refreshToken: tokens.refresh_token ?? null,
    scopes: tokens.scope.split(" ").filter(Boolean),
    email: tokens.id_token ? verifiedEmail(tokens.id_token) : null,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<AccessToken> {
  const { clientId, clientSecret } = credentials();
  const response = await postForm(TOKEN_URL, {
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  if (!response.ok) {
    const body = TokenErrorSchema.safeParse(await response.json().catch(() => null));
    if (body.success && body.data.error === "invalid_grant") {
      throw new GoogleGrantError("Google no longer accepts the refresh token");
    }
    throw new Error(`Google token refresh failed (${response.status})`);
  }
  const tokens = TokenResponseSchema.parse(await response.json());
  return { token: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 };
}

/** Asks Google to forget a grant PlanToMe won't use. Best effort. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await postForm(REVOKE_URL, { token });
  } catch {
    // Nothing else to do: the token was never stored.
  }
}
