/** How long a tap on "Connect Google Calendar" stays good for. */
export const CONNECT_REQUEST_TTL_MS = 10 * 60_000;

/** How connecting Google Calendar ended, shown on /auth/connect/done. */
export type ConnectResult = "connected" | "denied" | "wrong-account" | "expired" | "error";

export function connectDoneUrl(origin: string, result: ConnectResult): URL {
  return new URL(`/auth/connect/done?result=${result}`, origin);
}
