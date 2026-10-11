import { count, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { households, members, passkeys, users } from "@/lib/db/schema";
import { addStartingCategories } from "@/lib/sorting/categories";
import type { NewPasskey } from "./passkeys";

/** The household's name until the first-run steps (BUD-41) ask for one. */
export const FIRST_HOUSEHOLD_NAME = "Our household";

/** True once someone has set the app up. After that, new people only join by invite. */
export async function hasUsers(db: Db): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(users);
  return (row?.n ?? 0) > 0;
}

/**
 * Creates the first user, their household with its starting categories, them as its Owner, and
 * their passkey, all together.
 * Returns false and saves nothing when someone else already set the app up.
 */
export async function createOwner(
  db: Db,
  owner: { userId: string; name: string; email: string; passkey: NewPasskey; label: string },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Two first visits at once must not make two owners.
    await tx.execute(sql`lock table ${users} in share row exclusive mode`);
    const [row] = await tx.select({ n: count() }).from(users);
    if ((row?.n ?? 0) > 0) return false;
    const [household] = await tx
      .insert(households)
      .values({ name: FIRST_HOUSEHOLD_NAME })
      .returning({ id: households.id });
    await addStartingCategories(tx, household.id);
    await tx.insert(users).values({ id: owner.userId, name: owner.name, email: owner.email });
    await tx.insert(members).values({
      householdId: household.id,
      userId: owner.userId,
      role: "owner",
      displayName: owner.name,
    });
    await tx.insert(passkeys).values({
      userId: owner.userId,
      label: owner.label,
      ...owner.passkey,
      lastUsedAt: new Date(),
    });
    return true;
  });
}
