import { and, eq, gt, lt } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { SESSION_DAYS } from "./cookies";
import { hashToken, newToken } from "./tokens";

const DAY = 24 * 60 * 60 * 1000;

function expiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_DAYS * DAY);
}

/** Starts a session and returns the token for the cookie. Only the token's hash is stored. */
export async function createSession(db: Db, userId: string, now = new Date()) {
  const token = newToken();
  const expiresAt = expiry(now);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  // Tidy away this person's expired sessions while we're here.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, now)));
  return { token, expiresAt };
}

/**
 * The user a session token belongs to, or null when it's unknown or expired. A session in use is
 * pushed out to 30 days again, at most once a day.
 */
export async function findSession(db: Db, token: string | undefined, now = new Date()) {
  if (!token) return null;
  const id = hashToken(token);
  const [row] = await db
    .select({ userId: sessions.userId, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)));
  if (!row) return null;
  if (row.expiresAt.getTime() - now.getTime() < (SESSION_DAYS - 1) * DAY) {
    const expiresAt = expiry(now);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    return { userId: row.userId, expiresAt };
  }
  return row;
}

/** Ends a session, as on Sign out. */
export async function deleteSession(db: Db, token: string | undefined) {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}
