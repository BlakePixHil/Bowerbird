"use server";

import {
  BUDGETS_RUN,
  savePaydays,
  viewerOf,
  type BudgetsRun,
  type IncomeDraft,
  type PaydaysSaved,
} from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PAY_FREQUENCIES, todayIn, type PayFrequency } from "@/lib/money";

const muddled = { ok: false as const, error: "That change didn't make sense. Try again." };

const text = (value: unknown, max: number) => typeof value === "string" && value.length <= max;

function draftOf(value: unknown): IncomeDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.id !== null && !text(v.id, 64)) return null;
  if (!text(v.label, 200) || !text(v.anchorDate, 10)) return null;
  if (v.accountId !== null && !text(v.accountId, 64)) return null;
  if (typeof v.amountCents !== "number") return null;
  if (!PAY_FREQUENCIES.includes(v.frequency as PayFrequency)) return null;
  if (v.secondDay !== null && typeof v.secondDay !== "number") return null;
  return {
    id: v.id as string | null,
    label: v.label as string,
    amountCents: v.amountCents,
    accountId: v.accountId as string | null,
    frequency: v.frequency as PayFrequency,
    anchorDate: v.anchorDate as string,
    secondDay: v.secondDay as number | null,
  };
}

/** Saves "When are you paid?": the person's incomes and how their budgets run. */
export async function saveMyPaydays(input: {
  incomes: unknown[];
  budgetsRun: string;
}): Promise<PaydaysSaved> {
  const me = await requireMember();
  if (!Array.isArray(input.incomes) || input.incomes.length > 20) return muddled;
  const incomes = input.incomes.map(draftOf);
  if (incomes.some((draft) => draft === null)) return muddled;
  if (!BUDGETS_RUN.includes(input.budgetsRun as BudgetsRun)) return muddled;
  return savePaydays(
    getDb(),
    viewerOf(me),
    { incomes: incomes as IncomeDraft[], budgetsRun: input.budgetsRun as BudgetsRun },
    todayIn(me.household.timezone),
  );
}
