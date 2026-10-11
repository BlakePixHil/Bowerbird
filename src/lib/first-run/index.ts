import { and, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { households, members, users } from "@/lib/db/schema";
import { NAME_MAX, tidyName, type WelcomeSaved } from "./rules";

export * from "./rules";

/**
 * Step 1: the person's name and what to call the household, then on to bringing in transactions.
 * Only the Owner names the household. Does nothing once setup is finished.
 */
export async function saveWelcome(
  db: Db,
  me: { userId: string; memberId: string; householdId: string; owner: boolean },
  input: { name: string; household: string },
): Promise<WelcomeSaved> {
  const name = tidyName(input.name);
  if (!name)
    return { ok: false, field: "name", error: `Add your name, up to ${NAME_MAX} letters.` };
  const household = me.owner ? tidyName(input.household) : null;
  if (me.owner && !household)
    return {
      ok: false,
      field: "household",
      error: `Add a name for your household, up to ${NAME_MAX} letters.`,
    };
  return db.transaction(async (tx) => {
    const moved = await tx
      .update(members)
      .set({ displayName: name, setupStep: "bring" })
      .where(and(eq(members.id, me.memberId), isNotNull(members.setupStep)))
      .returning({ id: members.id });
    if (moved.length === 0)
      return { ok: false as const, field: null, error: "Setup is already finished." };
    await tx.update(users).set({ name }).where(eq(users.id, me.userId));
    if (household)
      await tx.update(households).set({ name: household }).where(eq(households.id, me.householdId));
    return { ok: true as const };
  });
}

/** Step 3 is done, so setup is finished: from now on Home is just Home. */
export async function finishFirstRun(db: Db, memberId: string): Promise<void> {
  await db.update(members).set({ setupStep: null }).where(eq(members.id, memberId));
}
