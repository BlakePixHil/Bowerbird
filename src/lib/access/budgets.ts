import { and, asc, eq, gte, inArray, lte, min, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { budgets, categories, members, splits, transactions } from "@/lib/db/schema";
import { todayIn, type DaySpend, type Period, type PeriodSpec, type PlainDate } from "@/lib/money";
import { partCategory, partCents, partsJoin } from "@/lib/sorting/parts";
import { scopeFor, type Viewer } from "./accounts";
import { budgetProblem, tidyBudget, type Budget, type BudgetDraft } from "./plan";
import {
  progressOf,
  spendingFrom,
  type BudgetProgress,
  type ProgressBudget,
  type ProgressCategory,
} from "./progress";

/**
 * Budgets: an amount per category for a period, from Set a budget and Change the plan. Until
 * project 07 every budget is personal: the person who set it is the only one who sees or changes
 * it. Spending against them is worked out when read, from the same totals as Categories.
 */

/** How many budgets one save can change or remove: more than a household has categories. */
const PLAN_MAX = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const columns = {
  id: budgets.id,
  scope: budgets.scope,
  ownerMemberId: budgets.ownerMemberId,
  categoryId: budgets.categoryId,
  amountCents: budgets.amountCents,
  period: budgets.period,
  periodAnchor: budgets.periodAnchor,
  periodEnd: budgets.periodEnd,
  periodSecondDay: budgets.periodSecondDay,
  rollover: budgets.rollover,
  onSetDates: budgets.onSetDates,
  alert80: budgets.alert80,
  alert100: budgets.alert100,
};

async function isMember(db: Db, viewer: Viewer): Promise<boolean> {
  const [found] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, viewer.memberId), eq(members.householdId, viewer.householdId)));
  return !!found;
}

/**
 * The viewer's budgets and the household's, in the household's category order. A budget whose
 * category is archived, or no longer counts toward budgets, is left out until it counts again.
 */
export async function budgetsOf(db: Db, viewer: Viewer): Promise<Budget[]> {
  return db
    .select(columns)
    .from(budgets)
    .innerJoin(categories, eq(categories.id, budgets.categoryId))
    .where(
      and(
        eq(budgets.householdId, viewer.householdId),
        or(eq(budgets.scope, "household"), eq(budgets.ownerMemberId, viewer.memberId)),
        eq(categories.householdId, viewer.householdId),
        eq(categories.kind, "spending"),
        eq(categories.countsTowardBudgets, true),
        eq(categories.archived, false),
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name), asc(budgets.id));
}

/**
 * The viewer's budgets in one period, with what's been spent against each, from accounts they see
 * in full that count toward budgets. `period` is one of `spec`'s, the person's own periods, and
 * `timeZone` is the household's, for the day each budget was set.
 */
export async function budgetProgress(
  db: Db,
  viewer: Viewer,
  view: { spec: PeriodSpec; period: Period; today: PlainDate; timeZone: string },
): Promise<BudgetProgress> {
  const { spec, period, today, timeZone } = view;
  const member = await isMember(db, viewer);
  const [list, categoryRows, scope] = await Promise.all([
    member ? budgetsWithDates(db, viewer, timeZone) : Promise.resolve([]),
    db
      .select({
        id: categories.id,
        name: categories.name,
        icon: categories.icon,
        colourSlot: categories.colourSlot,
        kind: categories.kind,
        countsTowardBudgets: categories.countsTowardBudgets,
      })
      .from(categories)
      .where(and(eq(categories.householdId, viewer.householdId), eq(categories.archived, false)))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    scopeFor(db, viewer, "household"),
  ]);
  const budgetCategories: ProgressCategory[] = member ? categoryRows : [];
  const accountIds = scope.accounts
    .filter((account) => account.access === "full" && account.includeInBudgets)
    .map((account) => account.id);
  const seen = and(
    eq(transactions.householdId, viewer.householdId),
    accountIds.length > 0 ? inArray(transactions.accountId, accountIds) : sql`false`,
  );

  const [first] = await db
    .select({ day: min(transactions.date) })
    .from(transactions)
    .where(seen);
  const firstDay = first?.day ?? null;
  const input = { today, spec, period, budgets: list, categories: budgetCategories, firstDay };
  const from = spendingFrom(input);
  const to = today < period.end ? today : period.end;

  const spent =
    sql<number>`coalesce(sum(-${partCents}) filter (where ${partCents} < 0 and ${transactions.transferGroupId} is null), 0)`.mapWith(
      Number,
    );
  const rows =
    firstDay === null
      ? []
      : await db
          .select({ categoryId: partCategory, date: transactions.date, cents: spent })
          .from(transactions)
          .leftJoin(splits, partsJoin)
          .where(and(seen, gte(transactions.date, from), lte(transactions.date, to)))
          .groupBy(partCategory, transactions.date)
          .orderBy(asc(transactions.date));
  const days = new Map<string | null, DaySpend[]>();
  for (const row of rows) {
    if (row.cents <= 0) continue;
    const key = row.categoryId ?? null;
    const list = days.get(key) ?? [];
    list.push({ date: row.date, cents: row.cents });
    days.set(key, list);
  }
  return progressOf({ ...input, days });
}

/** The viewer's budgets, each with the day it was first set in the household's time zone. */
async function budgetsWithDates(
  db: Db,
  viewer: Viewer,
  timeZone: string,
): Promise<ProgressBudget[]> {
  const [list, created] = await Promise.all([
    budgetsOf(db, viewer),
    db
      .select({ id: budgets.id, createdAt: budgets.createdAt })
      .from(budgets)
      .where(eq(budgets.householdId, viewer.householdId)),
  ]);
  const since = new Map(created.map((row) => [row.id, todayIn(timeZone, row.createdAt)]));
  return list.map((budget) => ({ ...budget, since: since.get(budget.id)! }));
}

/** A change to the plan: budgets set or changed, and the ids of budgets to remove. */
export type PlanChange = { budgets: readonly BudgetDraft[]; removed: readonly string[] };

export type PlanSaved = { ok: true; budgets: Budget[] } | { ok: false; error: string };

/**
 * Save budgets the viewer set or changed, and remove the ones they took away, all together or not
 * at all. A new budget for a category that already has one of the viewer's changes that one, so
 * sending the same change twice is safe. The category of a saved budget never changes.
 */
export async function savePlan(db: Db, viewer: Viewer, change: PlanChange): Promise<PlanSaved> {
  if (!(await isMember(db, viewer))) return { ok: false, error: "You can't change budgets here." };
  if (change.budgets.length > PLAN_MAX || change.removed.length > PLAN_MAX)
    return { ok: false, error: "That's too many changes at once. Save a few at a time." };

  const usable = new Map(
    (
      await db
        .select({
          id: categories.id,
          name: categories.name,
          kind: categories.kind,
          countsTowardBudgets: categories.countsTowardBudgets,
          archived: categories.archived,
        })
        .from(categories)
        .where(eq(categories.householdId, viewer.householdId))
    )
      .filter((c) => c.kind === "spending" && c.countsTowardBudgets && !c.archived)
      .map((c) => [c.id, c.name]),
  );

  const drafts = change.budgets.map(tidyBudget);
  const named = new Set<string>();
  for (const draft of drafts) {
    const name = usable.get(draft.categoryId);
    if (!name) return { ok: false, error: "Pick a category that counts toward budgets." };
    if (named.has(draft.categoryId))
      return { ok: false, error: `${name} has two budgets here. Keep one of them.` };
    named.add(draft.categoryId);
    const problem = budgetProblem(draft, name);
    if (problem) return { ok: false, error: problem };
  }
  const removed = change.removed.filter((id) => UUID.test(id)).map((id) => id.toLowerCase());

  await db.transaction(async (tx) => {
    // One save at a time per person, so two saves can't both add the same category's budget.
    await tx
      .select({ id: members.id })
      .from(members)
      .where(eq(members.id, viewer.memberId))
      .for("update");
    const mine = and(
      eq(budgets.householdId, viewer.householdId),
      eq(budgets.scope, "personal"),
      eq(budgets.ownerMemberId, viewer.memberId),
    );
    if (removed.length > 0) await tx.delete(budgets).where(and(mine, inArray(budgets.id, removed)));
    const had = await tx
      .select({ id: budgets.id, categoryId: budgets.categoryId })
      .from(budgets)
      .where(mine);
    const byId = new Map(had.map((row) => [row.id, row.categoryId]));
    const byCategory = new Map(had.map((row) => [row.categoryId, row.id]));

    for (const { id: draftId, categoryId, ...fields } of drafts) {
      const id = draftId?.toLowerCase();
      const existing =
        id && byId.get(id) === categoryId ? id : (byCategory.get(categoryId) ?? null);
      if (existing)
        await tx
          .update(budgets)
          .set(fields)
          .where(and(mine, eq(budgets.id, existing)));
      else
        await tx.insert(budgets).values({
          ...fields,
          categoryId,
          householdId: viewer.householdId,
          scope: "personal",
          ownerMemberId: viewer.memberId,
        });
    }
  });
  return { ok: true, budgets: await budgetsOf(db, viewer) };
}
