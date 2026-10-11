import { createHash, timingSafeEqual } from "node:crypto";

/** Shorter than this and CRON_SECRET is too easy to guess, so the daily job refuses every call. */
const MIN_SECRET_LENGTH = 16;

const digest = (text: string) => createHash("sha256").update(text).digest();

/**
 * Whether a request to the daily job comes from Vercel Cron, which sends
 * `Authorization: Bearer <CRON_SECRET>`. Without a long enough CRON_SECRET nothing gets in.
 */
export function isCronCall(
  authorization: string | null,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const secret = env.CRON_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH || !authorization) return false;
  // Compare digests, so the time taken says nothing about the secret, even its length.
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
