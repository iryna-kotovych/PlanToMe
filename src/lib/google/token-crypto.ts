import "server-only";

// Google refresh tokens are sealed with AES-256-GCM before they are stored
// (spec 5.1). The key, TOKEN_ENCRYPTION_KEY (32 random bytes in base64),
// lives only in the server's environment. The owner's id is bound in as
// associated data, so a sealed token only opens for its own row.

const VERSION = "v1";

/** The server's key is missing or malformed: a setup problem, not a bad token. */
export class TokenKeyError extends Error {}

async function importKey(): Promise<CryptoKey> {
  const raw = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? "", "base64");
  if (raw.length !== 32) {
    throw new TokenKeyError("TOKEN_ENCRYPTION_KEY must be 32 bytes in base64");
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function algorithm(iv: Uint8Array<ArrayBuffer>, userId: string): AesGcmParams {
  return { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) };
}

export async function sealToken(token: string, userId: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    algorithm(iv, userId),
    await importKey(),
    new TextEncoder().encode(token),
  );
  return [
    VERSION,
    Buffer.from(iv).toString("base64url"),
    Buffer.from(sealed).toString("base64url"),
  ].join(".");
}

/** Throws when the value wasn't sealed with this key for this owner. */
export async function openToken(value: string, userId: string): Promise<string> {
  const key = await importKey();
  const [version, iv, sealed] = value.split(".");
  if (version !== VERSION || !iv || !sealed) throw new Error("Unknown token format");
  const plain = await crypto.subtle.decrypt(
    algorithm(new Uint8Array(Buffer.from(iv, "base64url")), userId),
    key,
    new Uint8Array(Buffer.from(sealed, "base64url")),
  );
  return new TextDecoder().decode(plain);
}
