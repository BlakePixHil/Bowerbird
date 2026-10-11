"use server";

import { savePlan, viewerOf, type BudgetDraft, type PlanSaved } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { BUDGET_PERIODS, type BudgetPeriod } from "@/lib/money";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const muddled = { ok: false as const, error: "That change didn't make sense. Try again." };

const isId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const dateOrNull = (value: unknown) =>
  value === null || (typeof value === "string" && value.length === 10);

function draftOf(value: unknown): BudgetDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.id !== null && !isId(v.id)) return null;
  if (!isId(v.categoryId) || typeof v.amountCents !== "number") return null;
  if (!BUDGET_PERIODS.includes(v.period as BudgetPeriod)) return null;
  if (!dateOrNull(v.periodAnchor) || !dateOrNull(v.periodEnd)) return null;
  if (v.periodSecondDay !== null && typeof v.periodSecondDay !== "number") return null;
  const flags = [v.rollover, v.onSetDates, v.alert80, v.alert100];
  if (flags.some((flag) => typeof flag !== "boolean")) return null;
  return {
    id: v.id as string | null,
    categoryId: v.categoryId,
    amountCents: v.amountCents,
    period: v.period as BudgetPeriod,
    periodAnchor: v.periodAnchor as string | null,
    periodEnd: v.periodEnd as string | null,
    periodSecondDay: v.periodSecondDay as number | null,
    rollover: v.rollover as boolean,
    onSetDates: v.onSetDates as boolean,
    alert80: v.alert80 as boolean,
    alert100: v.alert100 as boolean,
  };
}

/**
 * Saves budgets set or changed on Set a budget or Change the plan, and removes the ones taken
 * away, all together. The change carries its own `id`, made on the device, like the other changes
 * the offline queue (project 06) will hold. Sending one twice is safe.
 */
export async function saveBudgets(change: {
  id: string;
  budgets: unknown[];
  removed: unknown[];
}): Promise<PlanSaved> {
  const viewer = viewerOf(await requireMember());
  if (!isId(change.id) || !Array.isArray(change.budgets) || !Array.isArray(change.removed))
    return muddled;
  if (change.budgets.length > 200 || change.removed.length > 200) return muddled;
  const budgets = change.budgets.map(draftOf);
  if (budgets.some((draft) => draft === null) || !change.removed.every(isId)) return muddled;
  return savePlan(getDb(), viewer, {
    budgets: budgets as BudgetDraft[],
    removed: change.removed as string[],
  });
}
