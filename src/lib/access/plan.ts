import {
  BUDGET_PERIODS,
  daysBetween,
  isCents,
  isPlainDate,
  parts,
  type BudgetPeriod,
  type PeriodSpec,
  type PlainDate,
} from "@/lib/money";
import { BUDGET_MAX_CENTS, CUSTOM_DAYS_MAX } from "./limits";

/**
 * Budgets as Set a budget and Change the plan edit them, and the checks a change has to pass
 * before it's saved. The server runs the same checks again (`savePlan` in ./budgets). Safe in the
 * browser.
 */

export type BudgetScope = "household" | "personal";

/** A budget being set or changed. */
export type BudgetDraft = {
  /** Null until it's saved. */
  id: string | null;
  categoryId: string;
  /** The limit for one period. */
  amountCents: number;
  period: BudgetPeriod;
  /** Where its periods count from. See `PeriodSpec` for what it means for each period. */
  periodAnchor: PlainDate | null;
  /** The last day of a custom budget. */
  periodEnd: PlainDate | null;
  /** The second day of the month for a twice-monthly budget. */
  periodSecondDay: number | null;
  /** Unspent money carries into the next period. */
  rollover: boolean;
  /** Comes out on set dates, like a bill. */
  onSetDates: boolean;
  alert80: boolean;
  alert100: boolean;
};

export type Budget = BudgetDraft & {
  id: string;
  /** Until project 07, every budget is personal to the person who set it. */
  scope: BudgetScope;
  ownerMemberId: string;
};

/** How a budget's periods run, for the periods helper. */
export const specOf = (
  budget: Pick<BudgetDraft, "period" | "periodAnchor" | "periodEnd" | "periodSecondDay">,
): PeriodSpec => ({
  period: budget.period,
  anchor: budget.periodAnchor,
  end: budget.periodEnd,
  secondDay: budget.periodSecondDay,
});

/**
 * The draft as it's stored: fields its period doesn't use are cleared, a custom budget doesn't
 * roll over because it doesn't repeat, and one that rolls over isn't also on set dates (the board
 * offers them as one choice of kind).
 */
export function tidyBudget(draft: BudgetDraft): BudgetDraft {
  const { period } = draft;
  const rollover = period !== "custom" && draft.rollover;
  return {
    ...draft,
    periodAnchor: period === "quarterly" ? null : draft.periodAnchor,
    periodEnd: period === "custom" ? draft.periodEnd : null,
    periodSecondDay: period === "twice_monthly" ? draft.periodSecondDay : null,
    rollover,
    onSetDates: draft.onSetDates && !rollover,
  };
}

/** What stops a budget being saved, in words for the person, or null when nothing does. */
export function budgetProblem(draft: BudgetDraft, name: string): string | null {
  if (!isCents(draft.amountCents) || draft.amountCents <= 0) return `Set an amount for ${name}.`;
  if (draft.amountCents > BUDGET_MAX_CENTS)
    return `That's more than one budget can hold. Set a smaller amount for ${name}.`;
  if (!BUDGET_PERIODS.includes(draft.period)) return `Pick how often ${name} runs.`;
  for (const date of [draft.periodAnchor, draft.periodEnd])
    if (date !== null && (typeof date !== "string" || !isPlainDate(date)))
      return `Pick a real date for ${name}.`;

  if (draft.period === "custom") {
    const { periodAnchor: first, periodEnd: last } = draft;
    if (!first || !last) return `Pick the first and last days for ${name}.`;
    if (last < first) return `${name} ends before it starts. Pick the last day again.`;
    if (daysBetween(first, last) + 1 > CUSTOM_DAYS_MAX)
      return `A custom budget can run for up to two years. Pick an earlier last day for ${name}.`;
  }

  if (draft.period === "twice_monthly") {
    const second = draft.periodSecondDay;
    if (
      !draft.periodAnchor ||
      second === null ||
      !Number.isInteger(second) ||
      second < 1 ||
      second > 31
    )
      return `Pick both days of the month for ${name}.`;
    if (parts(draft.periodAnchor).day === second) return `Pick two different days for ${name}.`;
  }
  return null;
}
