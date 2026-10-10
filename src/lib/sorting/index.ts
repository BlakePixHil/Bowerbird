import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import type { PlainDate } from "@/lib/money";

/** One transaction going through the sorting steps, with what the steps decided so far. */
export type SortingRow = {
  /** Set once the row is saved. A preview sorts rows that aren't saved yet. */
  id?: string;
  accountId: string;
  date: PlainDate;
  amountCents: number;
  description: string;
  /** The shop it's from, such as "Woolworths". */
  merchant?: { id: string | null; name: string };
  category?: {
    id: string;
    name: string;
    kind: "spending" | "income" | "transfer";
    /** Icon name from the inline icon set. */
    icon: string | null;
    /** 1 to 7 maps to --c1 to --c7. Null is the shared grey. */
    colourSlot: number | null;
  };
  /** Both sides of a transfer between the household's own accounts share this id. */
  transferGroupId?: string;
};

export type SortingContext = {
  db: Db;
  householdId: string;
  /** False for a preview: decide, but change nothing in the database. */
  save: boolean;
};

/** A step reads the rows and fills in what it decides. Later steps see earlier decisions. */
export type SortingStep = (context: SortingContext, rows: SortingRow[]) => Promise<void>;

/**
 * Runs after every import or sync, in this order (02 · Architecture, "After every import or
 * sync"): clean shop names (BUD-23), apply rules (BUD-25), match transfers (BUD-27). Project 03
 * adds each step here. Until then nothing is sorted and every row is left to check.
 */
export const STEPS: readonly SortingStep[] = [];

export type SortingCounts = {
  /** Rows that got a category, transfers included. */
  sorted: number;
  /** Rows with no category yet, for the person to sort. */
  toCheck: number;
  /** Rows matched as a transfer between the household's own accounts. */
  transfers: number;
};

export function countSorted(rows: readonly SortingRow[]): SortingCounts {
  const sorted = rows.filter((row) => row.category).length;
  return {
    sorted,
    toCheck: rows.length - sorted,
    transfers: rows.filter((row) => row.transferGroupId).length,
  };
}

/** What each row would get, without saving anything. For "Check before importing". */
export async function previewSorting(
  db: Db,
  householdId: string,
  rows: readonly Omit<SortingRow, "id">[],
  steps: readonly SortingStep[] = STEPS,
): Promise<SortingRow[]> {
  const copies = rows.map((row) => ({ ...row }));
  for (const step of steps) await step({ db, householdId, save: false }, copies);
  return copies;
}

/**
 * Sorts saved transactions and saves each row's shop, category and transfer pair. Pass the
 * database transaction the rows were written in, so an import is saved whole or not at all.
 */
export async function sortTransactions(
  db: Db,
  householdId: string,
  rows: SortingRow[],
  steps: readonly SortingStep[] = STEPS,
): Promise<SortingCounts> {
  for (const step of steps) await step({ db, householdId, save: true }, rows);
  for (const row of rows) {
    if (!row.id || !(row.merchant?.id || row.category || row.transferGroupId)) continue;
    await db
      .update(transactions)
      .set({
        merchantId: row.merchant?.id ?? null,
        categoryId: row.category?.id ?? null,
        transferGroupId: row.transferGroupId ?? null,
      })
      .where(and(eq(transactions.id, row.id), eq(transactions.householdId, householdId)));
  }
  return countSorted(rows);
}
