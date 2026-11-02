import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { CALENDAR_SCOPE, consentUrl, exchangeCode, GoogleGrantError, refreshAccessToken } =
  await import("./oauth");

// Invented client and tokens.
function idToken(claims: object): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.signature`;
}

function reply(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Google OAuth", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id.example");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("asks for lasting calendar access and the account's email", () => {
    const url = new URL(consentUrl("state-123", "https://planto-me.test/auth/connect/callback"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client-id.example",
      redirect_uri: "https://planto-me.test/auth/connect/callback",
      response_type: "code",
      scope: `openid email ${CALENDAR_SCOPE}`,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: "state-123",
    });
  });

  it("reads the granted scopes and the verified email from the code exchange", async () => {
    fetchMock.mockResolvedValue(
      reply({
        access_token: "access",
        expires_in: 3599,
        refresh_token: "refresh",
        scope: `openid ${CALENDAR_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
        id_token: idToken({ email: "owner@example.com", email_verified: true }),
      }),
    );
    const grant = await exchangeCode("code-1", "https://planto-me.test/auth/connect/callback");
    expect(grant).toMatchObject({
      token: "access",
      refreshToken: "refresh",
      email: "owner@example.com",
    });
    expect(grant.scopes).toContain(CALENDAR_SCOPE);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(init?.body)).toContain("grant_type=authorization_code");
  });

  it("doesn't trust an email Google hasn't verified", async () => {
    fetchMock.mockResolvedValue(
      reply({
        access_token: "access",
        expires_in: 3599,
        scope: CALENDAR_SCOPE,
        id_token: idToken({ email: "owner@example.com", email_verified: false }),
      }),
    );
    expect((await exchangeCode("code-1", "https://planto-me.test/cb")).email).toBeNull();
  });

  it("tells a refused refresh token apart from other failures", async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: "invalid_grant" }, 400));
    await expect(refreshAccessToken("refresh")).rejects.toBeInstanceOf(GoogleGrantError);
    fetchMock.mockResolvedValueOnce(reply({ error: "internal_failure" }, 500));
    const failure = refreshAccessToken("refresh");
    await expect(failure).rejects.toThrow();
    await expect(failure).rejects.not.toBeInstanceOf(GoogleGrantError);
  });
});
