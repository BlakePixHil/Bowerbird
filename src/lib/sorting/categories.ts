import { and, count, eq, gt, lt, max, notExists, sql, sum } from "drizzle-orm";
import { STARTING_CATEGORIES } from "@/config/app";
import type { Db } from "@/lib/db";
import { categories, splits, transactions } from "@/lib/db/schema";
import { addMonths, type PlainDate } from "@/lib/money";
import { COLOUR_SLOTS } from "./colour";
import { countedMoney } from "./transfers";

/**
 * Gives a household the starting categories from config, in that order. Does nothing for a
 * household that already has categories, so it's safe to run more than once.
 */
export async function addStartingCategories(db: Db, householdId: string): Promise<number> {
  const [had] = await db
    .select({ n: count() })
    .from(categories)
    .where(eq(categories.householdId, householdId));
  if ((had?.n ?? 0) > 0) return 0;
  await db.insert(categories).values(
    STARTING_CATEGORIES.map((category, i) => ({
      householdId,
      name: category.name,
      kind: category.kind,
      icon: category.icon,
      sortOrder: i,
    })),
  );
  return STARTING_CATEGORIES.length;
}

/** How far back "biggest" looks, ending at the household's newest transaction. */
export const COLOUR_MONTHS = 3;

export type ColourCategory = {
  id: string;
  kind: "spending" | "income" | "transfer";
  colourSlot: number | null;
  colourPinned: boolean;
  archived: boolean;
};

/**
 * Decides which categories get which colour, and returns only the ones that change.
 *
 * A category keeps its slot for good, so the same colour means the same thing on every screen
 * from month to month. A slot only comes free when its category is archived, merged or deleted.
 * Free slots go, lowest first, to the spending categories without one that spent the most.
 * Categories with no spending stay grey. A colour someone pinned by hand always stays.
 */
export function fillColourSlots(
  list: readonly ColourCategory[],
  spentCents: ReadonlyMap<string, number>,
): Map<string, number | null> {
  const changes = new Map<string, number | null>();
  const held = new Set<number>();
  // Pinned colours claim their slot first, so a clash never takes a colour someone chose.
  const holders = [...list].sort((a, b) => Number(b.colourPinned) - Number(a.colourPinned));
  for (const category of holders) {
    const slot = category.colourSlot;
    if (slot === null) continue;
    const valid = Number.isInteger(slot) && slot >= 1 && slot <= COLOUR_SLOTS;
    if (category.archived || !valid || held.has(slot)) changes.set(category.id, null);
    else held.add(slot);
  }

  const free = Array.from({ length: COLOUR_SLOTS }, (_, i) => i + 1).filter((s) => !held.has(s));
  const waiting = list
    .filter(
      (category) =>
        category.kind === "spending" &&
        !category.archived &&
        (category.colourSlot === null || changes.has(category.id)) &&
        (spentCents.get(category.id) ?? 0) > 0,
    )
    .sort((a, b) => spentCents.get(b.id)! - spentCents.get(a.id)! || a.id.localeCompare(b.id));
  for (const [i, category] of waiting.slice(0, free.length).entries())
    changes.set(category.id, free[i]);
  return changes;
}

/**
 * What each spending category spent in the `COLOUR_MONTHS` before the household's newest
 * transaction, in positive cents. Counts money out the same way every screen does: transfers
 * between the household's own accounts don't count, and a split row counts in each of its parts.
 */
export async function spentByCategory(db: Db, householdId: string): Promise<Map<string, number>> {
  const [newest] = await db
    .select({ date: max(transactions.date) })
    .from(transactions)
    .where(eq(transactions.householdId, householdId));
  if (!newest?.date) return new Map();
  const after: PlainDate = addMonths(newest.date, -COLOUR_MONTHS);
  const counted = and(
    eq(transactions.householdId, householdId),
    countedMoney(),
    gt(transactions.date, after),
    eq(categories.kind, "spending"),
    eq(categories.archived, false),
  );

  const whole = await db
    .select({ id: categories.id, cents: sum(sql`-${transactions.amountCents}`).mapWith(Number) })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        counted,
        lt(transactions.amountCents, 0),
        notExists(
          db
            .select({ id: splits.id })
            .from(splits)
            .where(eq(splits.transactionId, transactions.id)),
        ),
      ),
    )
    .groupBy(categories.id);
  const parts = await db
    .select({ id: categories.id, cents: sum(sql`-${splits.amountCents}`).mapWith(Number) })
    .from(splits)
    .innerJoin(transactions, eq(transactions.id, splits.transactionId))
    .innerJoin(categories, eq(categories.id, splits.categoryId))
    .where(and(counted, lt(splits.amountCents, 0)))
    .groupBy(categories.id);

  const spent = new Map<string, number>();
  for (const row of [...whole, ...parts]) spent.set(row.id, (spent.get(row.id) ?? 0) + row.cents);
  return spent;
}

/**
 * Hands out any free colour slots in a household (see `fillColourSlots`). Runs after every import
 * or sync that sorted a row into a category. Locks the household's categories, so two imports at
 * once can't give one colour to two categories.
 */
export async function assignColours(db: Db, householdId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const list = await tx
      .select({
        id: categories.id,
        kind: categories.kind,
        colourSlot: categories.colourSlot,
        colourPinned: categories.colourPinned,
        archived: categories.archived,
      })
      .from(categories)
      .where(eq(categories.householdId, householdId))
      .for("update");
    if (list.length === 0) return 0;
    const changes = fillColourSlots(list, await spentByCategory(tx, householdId));
    // Clear first, so a slot that moves never sits on two categories at once.
    const ordered = [...changes].sort(([, a], [, b]) => Number(a !== null) - Number(b !== null));
    for (const [id, colourSlot] of ordered)
      await tx
        .update(categories)
        .set({ colourSlot })
        .where(and(eq(categories.id, id), eq(categories.householdId, householdId)));
    return changes.size;
  });
}
