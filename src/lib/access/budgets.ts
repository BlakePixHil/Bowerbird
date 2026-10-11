import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { budgets, categories, members } from "@/lib/db/schema";
import type { Viewer } from "./accounts";
import { budgetProblem, tidyBudget, type Budget, type BudgetDraft } from "./plan";

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
