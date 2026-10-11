import { and, asc, count, countDistinct, eq, gte, inArray, lte, min, ne, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { budgets, categories, members, rules, splits, transactions } from "@/lib/db/schema";
import { addMonths, daysBetween, type PlainDate } from "@/lib/money";
import { assignColours } from "@/lib/sorting/categories";
import { partCategory, partCents, partsJoin } from "@/lib/sorting/parts";
import { scopeFor, type Viewer } from "./accounts";
import type { ActivityCategory } from "./activity";
import { CATEGORY_NAME_MAX } from "./limits";

export { CATEGORY_NAME_MAX };

/**
 * Categories and rules: where the money goes by category, and the changes that tidy categories
 * up. Totals use the same rule as every other screen: money out for spending, money in for income,
 * and transfers left out (see `countedMoney`). Only accounts the viewer sees in full count.
 */

/** How many whole months the history and "usually" look back over. */
export const HISTORY_MONTHS = 6;

export type CategorySummary = ActivityCategory & {
  countsTowardBudgets: boolean;
  sortOrder: number;
  /**
   * This month so far, in positive cents: money out for a spending category, money in for income,
   * and money moved for a transfer category.
   */
  cents: number;
  /** Its transactions this month. */
  count: number;
  /** Its transactions of any date. */
  everCount: number;
  /** The last `HISTORY_MONTHS` whole months, oldest first, measured the same way as `cents`. */
  months: number[];
  /** What a whole month usually comes to: the average of the months since money first came in. */
  usual: number;
  /** Rules that send things here, on or off. */
  rules: number;
};

export type CategoryOverview = {
  /** The first of this month, and today. */
  from: PlainDate;
  to: PlainDate;
  /** The first day of each month in `months`, oldest first. */
  monthStarts: PlainDate[];
  /** In the household's order. */
  categories: CategorySummary[];
  /** Money out this month that has no category yet and isn't a transfer. */
  unsorted: { cents: number; count: number };
};

const monthOf = (date: PlainDate) => date.slice(0, 7);
const firstOfMonth = (date: PlainDate): PlainDate => `${monthOf(date)}-01`;

async function isMember(db: Db, viewer: Viewer): Promise<boolean> {
  const [found] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, viewer.memberId), eq(members.householdId, viewer.householdId)));
  return !!found;
}

async function fullAccounts(db: Db, viewer: Viewer): Promise<string[]> {
  const { accounts } = await scopeFor(db, viewer, "household");
  return accounts.filter((account) => account.access === "full").map((account) => account.id);
}

/** Sums per category and month. A split row counts in each of its parts (see `partCents`). */
function sums() {
  const paired = sql`${transactions.transferGroupId} is not null`;
  return {
    month: sql<string>`to_char(${transactions.date}, 'YYYY-MM')`,
    out: sql<number>`coalesce(sum(-${partCents}) filter (where ${partCents} < 0 and not ${paired}), 0)`.mapWith(
      Number,
    ),
    in: sql<number>`coalesce(sum(${partCents}) filter (where ${partCents} > 0 and not ${paired}), 0)`.mapWith(
      Number,
    ),
    moved: sql<number>`coalesce(sum(-${partCents}) filter (where ${partCents} < 0), 0)`.mapWith(
      Number,
    ),
  };
}

type MonthSums = { month: string; out: number; in: number; moved: number; n: number };

const measure = (kind: ActivityCategory["kind"], row: MonthSums) =>
  kind === "spending" ? row.out : kind === "income" ? row.in : row.moved;

/**
 * Every category with this month's money, its last few months and its counts, plus what's still
 * to sort this month. `today` is the household's today.
 */
export async function categoryOverview(
  db: Db,
  viewer: Viewer,
  today: PlainDate,
): Promise<CategoryOverview> {
  const from = firstOfMonth(today);
  const monthStarts = Array.from({ length: HISTORY_MONTHS }, (_, i) =>
    addMonths(from, i - HISTORY_MONTHS),
  );
  const empty: CategoryOverview = {
    from,
    to: today,
    monthStarts,
    categories: [],
    unsorted: { cents: 0, count: 0 },
  };
  if (!(await isMember(db, viewer))) return empty;

  const list = await db
    .select({
      id: categories.id,
      name: categories.name,
      kind: categories.kind,
      icon: categories.icon,
      colourSlot: categories.colourSlot,
      countsTowardBudgets: categories.countsTowardBudgets,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .where(and(eq(categories.householdId, viewer.householdId), eq(categories.archived, false)))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  const ruleCounts = await db
    .select({ categoryId: rules.categoryId, n: count() })
    .from(rules)
    .where(eq(rules.householdId, viewer.householdId))
    .groupBy(rules.categoryId);
  const ruleCount = new Map(ruleCounts.map((row) => [row.categoryId, row.n]));

  const accountIds = await fullAccounts(db, viewer);
  const seen = accountIds.length > 0;
  const visible = and(
    eq(transactions.householdId, viewer.householdId),
    seen ? inArray(transactions.accountId, accountIds) : sql`false`,
  );
  const inRange = and(gte(transactions.date, monthStarts[0]), lte(transactions.date, today));

  const money = sums();
  const [monthRows, everRows, [first]] = await Promise.all([
    db
      .select({
        categoryId: partCategory,
        ...money,
        n: countDistinct(transactions.id),
        outN: sql<number>`count(distinct ${transactions.id}) filter (where ${transactions.amountCents} < 0 and ${transactions.transferGroupId} is null)`.mapWith(
          Number,
        ),
      })
      .from(transactions)
      .leftJoin(splits, partsJoin)
      .where(and(visible, inRange))
      .groupBy(partCategory, money.month),
    db
      .select({ categoryId: partCategory, n: countDistinct(transactions.id) })
      .from(transactions)
      .leftJoin(splits, partsJoin)
      .where(visible)
      .groupBy(partCategory),
    db
      .select({ since: min(transactions.date) })
      .from(transactions)
      .where(visible),
  ]);

  const byCategory = new Map<string, MonthSums[]>();
  for (const row of monthRows)
    if (row.categoryId)
      byCategory.set(row.categoryId, [...(byCategory.get(row.categoryId) ?? []), row]);
  const ever = new Map<string, number>();
  for (const row of everRows)
    if (row.categoryId) ever.set(row.categoryId, (ever.get(row.categoryId) ?? 0) + row.n);

  // Months before the first transaction don't count toward "usually": nothing was here yet.
  const since = first?.since ?? null;
  const counted = monthStarts.filter((start) => since !== null && monthOf(start) >= monthOf(since));
  const thisMonth = monthOf(from);

  const summaries = list.map((category): CategorySummary => {
    const rows = byCategory.get(category.id) ?? [];
    const inMonth = (month: string) => rows.filter((row) => row.month === month);
    const total = (month: string) =>
      inMonth(month).reduce((sum, row) => sum + measure(category.kind, row), 0);
    const months = monthStarts.map((start) => total(monthOf(start)));
    const usualSum = counted.reduce((sum, start) => sum + total(monthOf(start)), 0);
    return {
      ...category,
      cents: total(thisMonth),
      count: inMonth(thisMonth).reduce((sum, row) => sum + row.n, 0),
      everCount: ever.get(category.id) ?? 0,
      months,
      usual: counted.length > 0 ? Math.round(usualSum / counted.length) : 0,
      rules: ruleCount.get(category.id) ?? 0,
    };
  });

  const unsortedRows = monthRows.filter((row) => !row.categoryId && row.month === thisMonth);
  return {
    ...empty,
    categories: summaries,
    unsorted: {
      cents: unsortedRows.reduce((sum, row) => sum + row.out, 0),
      count: unsortedRows.reduce((sum, row) => sum + row.outN, 0),
    },
  };
}

/** How far through the month `today` is: "Day 10 of 31". */
export function dayOfMonth(today: PlainDate): { day: number; of: number } {
  const from = firstOfMonth(today);
  return { day: daysBetween(from, today) + 1, of: daysBetween(from, addMonths(from, 1)) };
}

// Changes -----------------------------------------------------------------------------------

export type CategoryChanged = { ok: true; id: string } | { ok: false; error: string };

const notYours = { ok: false as const, error: "That category isn't in your household." };

function tidyName(name: unknown): string | { ok: false; error: string } {
  const tidy = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  if (!tidy) return { ok: false, error: "Give the category a name." };
  if (tidy.length > CATEGORY_NAME_MAX)
    return { ok: false, error: `Keep the name to ${CATEGORY_NAME_MAX} characters or fewer.` };
  return tidy;
}

/** Another category in the household already has this name, ignoring case. */
async function nameTaken(db: Db, householdId: string, name: string, except?: string) {
  const [found] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.householdId, householdId),
        eq(categories.archived, false),
        sql`lower(${categories.name}) = lower(${name})`,
        except ? ne(categories.id, except) : undefined,
      ),
    );
  return !!found;
}

const taken = (name: string) => ({
  ok: false as const,
  error: `There's already a category called ${name}.`,
});

async function ownCategory(db: Db, viewer: Viewer, id: string) {
  if (!(await isMember(db, viewer))) return null;
  const [found] = await db
    .select({ id: categories.id, name: categories.name, kind: categories.kind })
    .from(categories)
    .where(
      and(
        eq(categories.id, id),
        eq(categories.householdId, viewer.householdId),
        eq(categories.archived, false),
      ),
    );
  return found ?? null;
}

/** Adds a spending category at the end of the household's list. It's grey until it spends. */
export async function addCategory(db: Db, viewer: Viewer, name: string): Promise<CategoryChanged> {
  const tidy = tidyName(name);
  if (typeof tidy !== "string") return tidy;
  if (!(await isMember(db, viewer))) return { ok: false, error: "You're not in this household." };
  if (await nameTaken(db, viewer.householdId, tidy)) return taken(tidy);
  const [last] = await db
    .select({ n: sql<number>`coalesce(max(${categories.sortOrder}), -1)`.mapWith(Number) })
    .from(categories)
    .where(eq(categories.householdId, viewer.householdId));
  const [added] = await db
    .insert(categories)
    .values({
      householdId: viewer.householdId,
      name: tidy,
      kind: "spending",
      icon: "tag",
      sortOrder: (last?.n ?? -1) + 1,
    })
    .returning({ id: categories.id });
  return { ok: true, id: added.id };
}

/** Renames a category, and for spending, sets whether it counts toward budgets. */
export async function editCategory(
  db: Db,
  viewer: Viewer,
  id: string,
  change: { name: string; countsTowardBudgets: boolean },
): Promise<CategoryChanged> {
  const category = await ownCategory(db, viewer, id);
  if (!category) return notYours;
  const tidy = tidyName(change.name);
  if (typeof tidy !== "string") return tidy;
  if (await nameTaken(db, viewer.householdId, tidy, id)) return taken(tidy);
  await db
    .update(categories)
    .set({
      name: tidy,
      ...(category.kind === "spending"
        ? { countsTowardBudgets: change.countsTowardBudgets === true }
        : {}),
    })
    .where(and(eq(categories.id, id), eq(categories.householdId, viewer.householdId)));
  return { ok: true, id };
}

/**
 * Merges one spending category into another. Every transaction and split part in it moves, the
 * household's own and its partner's private ones alike, then its rules and budgets, and it's
 * removed. A budget for the same person and period as one the other category has adds to it, so
 * the plan's total stays the same. Totals don't change: the money only changes category.
 */
export async function mergeCategory(
  db: Db,
  viewer: Viewer,
  fromId: string,
  intoId: string,
): Promise<CategoryChanged> {
  if (fromId === intoId) return { ok: false, error: "Pick another category to merge into." };
  const [from, into] = await Promise.all([
    ownCategory(db, viewer, fromId),
    ownCategory(db, viewer, intoId),
  ]);
  if (!from || !into) return notYours;
  if (from.kind !== "spending" || into.kind !== "spending")
    return { ok: false, error: "Only spending categories can be merged." };

  const household = viewer.householdId;
  await db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({ categoryId: into.id })
      .where(and(eq(transactions.householdId, household), eq(transactions.categoryId, from.id)));
    await tx
      .update(splits)
      .set({ categoryId: into.id })
      .where(
        and(
          eq(splits.categoryId, from.id),
          inArray(
            splits.transactionId,
            tx
              .select({ id: transactions.id })
              .from(transactions)
              .where(eq(transactions.householdId, household)),
          ),
        ),
      );
    // A shop has one rule at most, so moving them can't clash.
    await tx
      .update(rules)
      .set({ categoryId: into.id })
      .where(and(eq(rules.householdId, household), eq(rules.categoryId, from.id)));

    const moving = await tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.householdId, household), eq(budgets.categoryId, from.id)));
    for (const budget of moving) {
      const [same] = await tx
        .select({ id: budgets.id })
        .from(budgets)
        .where(
          and(
            eq(budgets.householdId, household),
            eq(budgets.categoryId, into.id),
            eq(budgets.ownerMemberId, budget.ownerMemberId),
            eq(budgets.scope, budget.scope),
            eq(budgets.period, budget.period),
            budget.periodAnchor === null
              ? sql`${budgets.periodAnchor} is null`
              : eq(budgets.periodAnchor, budget.periodAnchor),
          ),
        )
        .limit(1);
      if (same) {
        await tx
          .update(budgets)
          .set({ amountCents: sql`${budgets.amountCents} + ${budget.amountCents}` })
          .where(eq(budgets.id, same.id));
        await tx.delete(budgets).where(eq(budgets.id, budget.id));
      } else await tx.update(budgets).set({ categoryId: into.id }).where(eq(budgets.id, budget.id));
    }

    await tx
      .delete(categories)
      .where(and(eq(categories.id, from.id), eq(categories.householdId, household)));
    await assignColours(tx, household);
  });
  return { ok: true, id: into.id };
}

/**
 * Deletes a spending category with nothing in it: no transaction or split part in the household,
 * whoever's account it's in. Its rules and budgets go with it.
 */
export async function deleteCategory(db: Db, viewer: Viewer, id: string): Promise<CategoryChanged> {
  const category = await ownCategory(db, viewer, id);
  if (!category) return notYours;
  if (category.kind !== "spending")
    return { ok: false, error: `${category.name} can't be deleted. Rename it instead.` };
  return db.transaction(async (tx) => {
    const [used] = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.householdId, viewer.householdId), eq(transactions.categoryId, id)))
      .limit(1);
    const [part] = await tx
      .select({ id: splits.id })
      .from(splits)
      .innerJoin(transactions, eq(transactions.id, splits.transactionId))
      .where(and(eq(transactions.householdId, viewer.householdId), eq(splits.categoryId, id)))
      .limit(1);
    if (used || part)
      return {
        ok: false as const,
        error: `${category.name} still has transactions in it. Merge it into another category instead.`,
      };
    await tx
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.householdId, viewer.householdId)));
    await assignColours(tx, viewer.householdId);
    return { ok: true as const, id };
  });
}
