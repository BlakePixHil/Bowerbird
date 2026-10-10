import { and, eq, gt, isNull, lt, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/lib/db";
import { emailLinks, users } from "@/lib/db/schema";
import { EMAIL_LINK_MINUTES, EMAIL_LINKS_PER_WINDOW } from "./limits";
import { hashToken, newToken } from "./tokens";

export { EMAIL_LINK_MINUTES, EMAIL_LINKS_PER_WINDOW };

const MINUTE = 60_000;

/** The email in lower case, or null if it doesn't look like an email. */
export function cleanEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export type NewEmailLink =
  | { kind: "made"; token: string; name: string }
  /** No member has this email. Nothing is sent, and the screen says the same as when it is. */
  | { kind: "unknown" }
  /** Three links in the last 15 minutes already. */
  | { kind: "limited" };

/** Makes a sign-in link for a member's email. Only the token's hash is kept. */
export async function createEmailLink(
  db: Db,
  email: string,
  now = new Date(),
): Promise<NewEmailLink> {
  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);
  if (!user) return { kind: "unknown" };

  const windowStart = new Date(now.getTime() - EMAIL_LINK_MINUTES * MINUTE);
  const [{ sent }] = await db
    .select({ sent: sql<number>`count(*)::int` })
    .from(emailLinks)
    .where(and(sql`lower(${emailLinks.email}) = ${email}`, gt(emailLinks.createdAt, windowStart)));
  if (sent >= EMAIL_LINKS_PER_WINDOW) return { kind: "limited" };

  // Links over a day old are of no use to anyone, so the table stays small.
  await db
    .delete(emailLinks)
    .where(lt(emailLinks.createdAt, new Date(now.getTime() - 1440 * MINUTE)));
  const token = newToken();
  await db.insert(emailLinks).values({
    email,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + EMAIL_LINK_MINUTES * MINUTE),
    createdAt: now,
  });
  return { kind: "made", token, name: user.name };
}

/**
 * Uses a sign-in link and returns whose it is, or null if it's unknown, used, expired or not the
 * newest for its email. One update both checks and spends it, so two taps can't both sign in.
 */
export async function redeemEmailLink(
  db: Db,
  token: string | null | undefined,
  now = new Date(),
): Promise<string | null> {
  if (!token) return null;
  const newer = alias(emailLinks, "newer");
  const [used] = await db
    .update(emailLinks)
    .set({ usedAt: now })
    .where(
      and(
        eq(emailLinks.tokenHash, hashToken(token)),
        isNull(emailLinks.usedAt),
        gt(emailLinks.expiresAt, now),
        notExists(
          db
            .select({ id: newer.id })
            .from(newer)
            .where(
              and(
                sql`lower(${newer.email}) = lower(${emailLinks.email})`,
                gt(newer.createdAt, emailLinks.createdAt),
              ),
            ),
        ),
      ),
    )
    .returning({ email: emailLinks.email });
  if (!used) return null;
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${used.email.toLowerCase()}`);
  return user?.id ?? null;
}
