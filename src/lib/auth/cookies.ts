/** The session cookie: a random token. The database keeps only its SHA-256. */
export const SESSION_COOKIE = "bb_session";

/** Holds the passkey challenge between the two steps of signing in, for five minutes. */
export const CHALLENGE_COOKIE = "bb_challenge";

/** Sessions last 30 days and are renewed while in use. */
export const SESSION_DAYS = 30;
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
export const CHALLENGE_MAX_AGE = 5 * 60;

/**
 * Cookie settings: httpOnly, SameSite=Lax and Secure. Secure is off only in local development,
 * where the app runs on plain http://localhost.
 */
export function cookieOptions(
  maxAge: number,
  env: Record<string, string | undefined> = process.env,
) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV !== "development" && env.NODE_ENV !== "test",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
