import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb, type Db } from "@/lib/db";
import { households, members, users } from "@/lib/db/schema";
import { SESSION_COOKIE } from "./cookies";
import { findSession } from "./sessions";

/** The signed-in person, their place in the household, and the household. */
export type SignedIn = {
  user: { id: string; name: string; email: string };
  member: { id: string; role: "owner" | "partner"; displayName: string };
  household: { id: string; name: string; timezone: string };
};

/** A user's member row and household. Phase 1 has one household per person. */
export async function memberFor(db: Db, userId: string): Promise<SignedIn | null> {
  const [row] = await db
    .select({
      user: { id: users.id, name: users.name, email: users.email },
      member: { id: members.id, role: members.role, displayName: members.displayName },
      household: { id: households.id, name: households.name, timezone: households.timezone },
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .innerJoin(households, eq(households.id, members.householdId))
    .where(eq(members.userId, userId))
    .orderBy(asc(members.createdAt))
    .limit(1);
  return row ?? null;
}

/** Who's signed in on this request, checked against the database once per request. */
export const currentMember = cache(async (): Promise<SignedIn | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const session = await findSession(db, token);
  return session ? memberFor(db, session.userId) : null;
});

/** For pages and server actions: the signed-in member, or off to the sign-in page. */
export async function requireMember(): Promise<SignedIn> {
  const me = await currentMember();
  if (!me) redirect("/sign-in");
  return me;
}

/** For API routes: the signed-in member, or a 401 response to send back. */
export async function apiMember(): Promise<SignedIn | Response> {
  return (await currentMember()) ?? Response.json({ error: "Sign in first" }, { status: 401 });
}
