import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  connections,
  emailLinks,
  households,
  members,
  splits,
  transactions,
  users,
} from "@/lib/db/schema";
import type { Viewer } from "./accounts";
import { sameName } from "./confirm";

export type HouseholdDeleted = { ok: true; hadLiveSync: boolean } | { ok: false; error: string };

/**
 * Deletes a household and everything in it, for good: its members and their people (each person
 * belongs to one household in phase 1, so anyone with no other household goes, with their
 * passkeys, sessions and sign-in links), accounts, transactions and their parts, tags and notes,
 * balances, categories, shops, rules, budgets, pay, imports, saved views, and live sync's
 * encrypted access links. Deleting the people's sessions signs everyone out. Only the Owner can,
 * and only by typing the household's name.
 *
 * Split parts go first: they hold on to their categories, and Postgres checks that before the
 * household's cascade reaches them. Everything else goes with the household's own row.
 */
export async function deleteHousehold(
  db: Db,
  viewer: Viewer,
  typedName: unknown,
): Promise<HouseholdDeleted> {
  return db.transaction(async (tx) => {
    const [household] = await tx
      .select({ name: households.name, role: members.role })
      .from(households)
      .innerJoin(
        members,
        and(eq(members.householdId, households.id), eq(members.id, viewer.memberId)),
      )
      .where(eq(households.id, viewer.householdId))
      .for("update", { of: households });
    if (!household) return { ok: false, error: "That household isn't yours to delete." };
    if (household.role !== "owner")
      return { ok: false, error: "Only the Owner can delete the household." };
    if (!sameName(typedName, household.name))
      return { ok: false, error: `Type the household’s name, ${household.name}, to confirm.` };

    const people = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .innerJoin(members, eq(members.userId, users.id))
      .where(eq(members.householdId, viewer.householdId));
    const ids = people.map((person) => person.id);
    const elsewhere = ids.length
      ? await tx
          .select({ userId: members.userId })
          .from(members)
          .where(
            and(
              inArray(members.userId, ids),
              notInArray(members.householdId, [viewer.householdId]),
            ),
          )
      : [];
    const staying = new Set(elsewhere.map((row) => row.userId));
    const leaving = people.filter((person) => !staying.has(person.id));

    const [live] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(connections)
      .where(eq(connections.householdId, viewer.householdId));

    await tx
      .delete(splits)
      .where(
        inArray(
          splits.transactionId,
          tx
            .select({ id: transactions.id })
            .from(transactions)
            .where(eq(transactions.householdId, viewer.householdId)),
        ),
      );
    await tx.delete(households).where(eq(households.id, viewer.householdId));
    if (leaving.length) {
      await tx.delete(users).where(
        inArray(
          users.id,
          leaving.map((person) => person.id),
        ),
      );
      await tx.delete(emailLinks).where(
        inArray(
          sql`lower(${emailLinks.email})`,
          leaving.map((person) => person.email.toLowerCase()),
        ),
      );
    }
    return { ok: true, hadLiveSync: (live?.n ?? 0) > 0 };
  });
}
