/**
 * Only the owner may use the real app (ALLOWED_EMAIL, server-side only).
 * Fails closed: with no allowed email configured, nobody gets in.
 */
export function isAllowedEmail(email: string | null | undefined): boolean {
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  return Boolean(allowed && email && email.trim().toLowerCase() === allowed);
}
