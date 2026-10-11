import { randomUUID } from "node:crypto";
import { and, count, eq, gte, inArray, lte, ne, or } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { splits, transactions } from "@/lib/db/schema";
import { addDays } from "@/lib/money";
import {
  couldPair,
  TRANSFER_DAYS,
  transferAccounts,
  transferCategory,
  transferScore,
  type TransferSide,
} from "@/lib/sorting/transfers";
import { visibleAccounts, type Viewer } from "./accounts";
import type { ActivityCategory } from "./activity";

export type TransferChanged =
  | {
      ok: true;
      /** Every row that changed: the one picked, and its other side when there is one. */
      ids: string[];
      category: ActivityCategory | null;
      paired: boolean;
    }
  | { ok: false; error: string };

const cannot = { ok: false as const, error: "That transaction isn't one you can change." };

async function fullAccounts(db: Db, viewer: Viewer): Promise<string[]> {
  const seen = await visibleAccounts(db, viewer);
  return seen.filter((account) => account.access === "full").map((account) => account.id);
}

async function seenRow(db: Db, viewer: Viewer, transactionId: string, accountIds: string[]) {
  if (accountIds.length === 0) return null;
  const [row] = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amountCents: transactions.amountCents,
      description: transactions.descriptionRaw,
      transferGroupId: transactions.transferGroupId,
    })
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), inArray(transactions.accountId, accountIds)));
  return row ?? null;
}

/**
 * "This is a transfer": puts the row in Transfers so it stops counting. If one of the viewer's
 * other accounts has the other side (the same amount the other way, within `TRANSFER_DAYS`, not
 * already paired or sorted elsewhere), the two become a pair. Safe to send twice.
 */
export async function markAsTransfer(
  db: Db,
  viewer: Viewer,
  transactionId: string,
): Promise<TransferChanged> {
  const accountIds = await fullAccounts(db, viewer);
  const row = await seenRow(db, viewer, transactionId, accountIds);
  if (!row) return cannot;
  const [split] = await db
    .select({ n: count() })
    .from(splits)
    .where(eq(splits.transactionId, row.id));
  if ((split?.n ?? 0) > 0)
    return {
      ok: false,
      error: "This one is split across categories, so change its parts instead.",
    };
  const category = await transferCategory(db, viewer.householdId);
  if (!category) return { ok: false, error: "There's no Transfers category to put it in." };

  return db.transaction(async (tx) => {
    if (row.transferGroupId) {
      // Already a pair: make sure both sides are in Transfers.
      const changed = await tx
        .update(transactions)
        .set({ categoryId: category.id })
        .where(
          and(
            eq(transactions.householdId, viewer.householdId),
            eq(transactions.transferGroupId, row.transferGroupId),
          ),
        )
        .returning({ id: transactions.id });
      return { ok: true, ids: changed.map((r) => r.id), category, paired: true };
    }

    const others = await tx
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        date: transactions.date,
        amountCents: transactions.amountCents,
        description: transactions.descriptionRaw,
      })
      .from(transactions)
      .where(
        and(
          inArray(transactions.accountId, accountIds),
          ne(transactions.accountId, row.accountId),
          ne(transactions.id, row.id),
          eq(transactions.amountCents, -row.amountCents),
          gte(transactions.date, addDays(row.date, -TRANSFER_DAYS)),
          lte(transactions.date, addDays(row.date, TRANSFER_DAYS)),
          couldPair(tx),
        ),
      );
    const accountMap = await transferAccounts(tx, viewer.householdId);
    const me: TransferSide = { ...row, key: row.id, fresh: true };
    const best = others
      .map((other) => {
        const side: TransferSide = { ...other, key: other.id, fresh: false };
        const [out, into] = row.amountCents < 0 ? [me, side] : [side, me];
        const score = transferScore(out, into, (id) => accountMap.get(id), true);
        return { other, score };
      })
      .filter((option) => option.score !== null)
      .sort((a, b) => b.score! - a.score! || a.other.id.localeCompare(b.other.id))[0];

    const group = best ? randomUUID() : null;
    const ids = best ? [row.id, best.other.id] : [row.id];
    await tx
      .update(transactions)
      .set({ categoryId: category.id, transferGroupId: group })
      .where(and(eq(transactions.householdId, viewer.householdId), inArray(transactions.id, ids)));
    return { ok: true, ids, category, paired: group !== null };
  });
}

/**
 * "Not a transfer": takes the row, and its other side if it was paired, out of Transfers. Both go
 * back to having no category, so they count again and wait to be checked. Rows that came in
 * earlier never pair with each other again by themselves.
 */
export async function notATransfer(
  db: Db,
  viewer: Viewer,
  transactionId: string,
): Promise<TransferChanged> {
  const accountIds = await fullAccounts(db, viewer);
  const row = await seenRow(db, viewer, transactionId, accountIds);
  if (!row) return cannot;
  const changed = await db
    .update(transactions)
    .set({ transferGroupId: null, categoryId: null })
    .where(
      and(
        eq(transactions.householdId, viewer.householdId),
        row.transferGroupId
          ? or(eq(transactions.id, row.id), eq(transactions.transferGroupId, row.transferGroupId))
          : eq(transactions.id, row.id),
      ),
    )
    .returning({ id: transactions.id });
  return { ok: true, ids: changed.map((r) => r.id), category: null, paired: false };
}
