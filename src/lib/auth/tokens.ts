import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** A random token for a cookie or a link: 32 bytes, base64url. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database keeps instead of a token: its SHA-256, in hex. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Seals a small value into a cookie-safe string that can't be changed without the secret. It isn't
 * encrypted, so it must never hold anything secret. Used for the passkey challenge between the two
 * steps of signing in.
 */
export function seal(value: unknown, secret: string, expiresAt: Date): string {
  const body = Buffer.from(JSON.stringify({ v: value, x: expiresAt.getTime() })).toString(
    "base64url",
  );
  return `${body}.${mac(body, secret)}`;
}

/** Opens a sealed string, or returns null when it was changed, sealed with another secret or expired. */
export function unseal<T>(sealed: string | undefined, secret: string, now = new Date()): T | null {
  if (!sealed) return null;
  const [body, tag, extra] = sealed.split(".");
  if (!body || !tag || extra !== undefined) return null;
  const expected = Buffer.from(mac(body, secret));
  const given = Buffer.from(tag);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      v: T;
      x: number;
    };
    return typeof parsed.x === "number" && parsed.x > now.getTime() ? parsed.v : null;
  } catch {
    return null;
  }
}

function mac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}
