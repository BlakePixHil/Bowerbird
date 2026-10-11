import {
  addDays,
  addMonths,
  carried,
  daysFor,
  dayOfPeriod,
  elapsed,
  expectedEvenly,
  billDays,
  nextPeriod,
  paceOf,
  periodContaining,
  plannedFor,
  previousPeriod,
  spentIn,
  type DaySpend,
  type Pace,
  type Period,
  type PeriodSpec,
  type PlainDate,
} from "@/lib/money";
import { specOf, type Budget } from "./plan";

/**
 * Budgets against what's been spent: one period of the person's budgets, as Budgets shows it. Pure
 * maths over spending already read, so it can be checked against Activity for the same days. See
 * 04 · Budgets and paydays (Pace, Rollover, Plan vs reality).
 *
 * Every budget shows in the page's period, the one the person's budgets run in: a weekly budget on
 * a monthly page is its month, as on Change the plan. Spending is money out that isn't a transfer,
 * pending included, the same as every other screen.
 */

/** How many months the Plan vs reality average looks back over, the reviewed period included. */
export const AVERAGE_MONTHS = 6;

/** A budget and the day it was first set, in the household's time zone. */
export type ProgressBudget = Budget & { since: PlainDate };

export type ProgressCategory = {
  id: string;
  name: string;
  icon: string | null;
  colourSlot: number | null;
  kind: "spending" | "income" | "transfer";
  countsTowardBudgets: boolean;
};

export type ProgressInput = {
  today: PlainDate;
  /** How the page's periods run: the person's own, from "How should budgets run?". */
  spec: PeriodSpec;
  /** The period shown. */
  period: Period;
  budgets: readonly ProgressBudget[];
  /** Every category, in the household's order. */
  categories: readonly ProgressCategory[];
  /** Spending per category and day, oldest first; null holds what has no category yet. */
  days: ReadonlyMap<string | null, readonly DaySpend[]>;
  /** The first day any account the viewer sees has a transaction, or null with none. */
  firstDay: PlainDate | null;
};

export type LineKind = "set" | "flex" | "roll";

export type BudgetLine = {
  budget: ProgressBudget;
  category: ProgressCategory;
  kind: LineKind;
  /** The days of the period it covers: all of them, or a custom budget's share. */
  days: Period;
  /**
   * For the period, what rolled over included. A bill on set dates plans what usually goes out in
   * the period, so a monthly bill is all in the fortnight it's due and none in the other.
   */
  planned: number;
  /** Rolled over from earlier periods. */
  carried: number;
  spent: number;
  /** Where spending would be by today if it went as usual. */
  expected: number;
  pace: Pace;
  /** The days this period it had spending, oldest first. */
  spentOn: PlainDate[];
  /**
   * For set dates: the first day this period it usually goes out, from the days it went out in
   * its own last whole period. Null when there's nothing to go by.
   */
  usualOn: PlainDate | null;
  /** The next of those days from today on, which can be after this period: "not due until". */
  nextOn: PlainDate | null;
  /** How far through its days today is, for the today tick. Null for set dates. */
  today: number | null;
};

export type Totals = { planned: number; spent: number; expected: number };

export type ReviewRow = {
  line: BudgetLine;
  /** How far spent was from planned: more than zero is over. */
  gap: number;
  /** What a period usually came to over the last `AVERAGE_MONTHS` months, or null without any. */
  average: number | null;
};

export type Review = {
  period: Period;
  /** How many periods the average is over. */
  periods: number;
  /** Biggest gaps first. */
  rows: ReviewRow[];
};

export type BudgetProgress = {
  spec: PeriodSpec;
  period: Period;
  today: PlainDate;
  /** Day 10 of 31, or null once the period is over. */
  day: { day: number; of: number } | null;
  lines: BudgetLine[];
  total: Totals;
  setDates: Totals;
  everyday: Totals;
  /**
   * Everyday spending against where it'd be by today. Bills on set dates are left out, so one that
   * comes out early doesn't put the period over pace (proposed by design).
   */
  pace: Pace;
  /** Spending in the period that no budget covers: categories without one, and not sorted yet. */
  outside: { cents: number; unsorted: number };
  previous: Period | null;
  /** Null when the next period hasn't started. */
  next: Period | null;
  /** Plan vs reality: the period before this one. Null until there's a whole one to look back on. */
  review: Review | null;
};

const kindOf = (budget: Budget): LineKind =>
  budget.onSetDates ? "set" : budget.rollover ? "roll" : "flex";

const sum = (lines: readonly BudgetLine[]): Totals => ({
  planned: lines.reduce((total, line) => total + line.planned, 0),
  spent: lines.reduce((total, line) => total + line.spent, 0),
  expected: lines.reduce((total, line) => total + line.expected, 0),
});

const later = (a: PlainDate, b: PlainDate) => (a > b ? a : b);

/** The periods from the one holding `from` up to, not including, `before`. */
function periodsBetween(spec: PeriodSpec, from: PlainDate, before: Period): Period[] {
  const list: Period[] = [];
  for (let p = periodContaining(from, spec); p && p.start < before.start; p = nextPeriod(p, spec))
    list.push(p);
  return list;
}

/**
 * Where rollover starts counting: the period the budget was set in, or the first with any
 * spending if that's later. Nothing carries from before a budget existed.
 */
function rolloverStart(budget: ProgressBudget, firstDay: PlainDate | null): PlainDate | null {
  return firstDay === null ? null : later(budget.since, firstDay);
}

/** The first day `progressOf` needs spending from, for averages and rollover. */
export function spendingFrom(
  input: Pick<ProgressInput, "spec" | "period" | "budgets" | "firstDay">,
): PlainDate {
  const { spec, period, budgets, firstDay } = input;
  let from = addMonths(period.start, -AVERAGE_MONTHS - 1);
  for (const budget of budgets) {
    const start = budget.rollover ? rolloverStart(budget, firstDay) : null;
    const own = start && periodContaining(start, spec);
    if (own && own.start < from) from = own.start;
  }
  return from;
}

/** One budget in one period. Null for a custom budget whose days aren't in it. */
function lineFor(
  budget: ProgressBudget,
  category: ProgressCategory,
  input: ProgressInput,
  period: Period,
): BudgetLine | null {
  const { spec, today, firstDay } = input;
  const own = specOf(budget);
  const days = daysFor(own, period);
  if (!days) return null;
  const spending = input.days.get(budget.categoryId) ?? [];
  const kind = kindOf(budget);

  let carry = 0;
  const start = kind === "roll" ? rolloverStart(budget, firstDay) : null;
  if (start)
    carry = carried(
      periodsBetween(spec, start, period).map((earlier) => ({
        planned: plannedFor(budget.amountCents, own, spec, earlier),
        spent: spentIn(spending, earlier),
      })),
    );
  let planned = plannedFor(budget.amountCents, own, spec, period) + carry;
  let expected = expectedEvenly(planned, days, today);
  let usualOn: PlainDate | null = null;
  let nextOn: PlainDate | null = null;
  // A bill counts on the days it usually goes out, so a month's rent lands in one fortnight.
  const bill =
    kind === "set" && own.period !== "custom"
      ? billDays(budget.amountCents, own, period, spending)
      : null;
  if (bill) {
    planned = bill.days.reduce((total, day) => total + day.cents, 0);
    expected = bill.days.reduce((total, day) => total + (day.date <= today ? day.cents : 0), 0);
    usualOn = bill.days[0]?.date ?? null;
    nextOn = bill.days.find((day) => day.date >= today)?.date ?? bill.next;
  }
  const upTo = { start: days.start, end: today < days.end ? today : days.end };
  const spent = today < days.start ? 0 : spentIn(spending, upTo);
  const spentOn =
    today < days.start
      ? []
      : spending.filter((day) => day.date >= upTo.start && day.date <= upTo.end && day.cents > 0);

  return {
    budget,
    category,
    kind,
    days,
    planned,
    carried: carry,
    spent,
    expected,
    pace: paceOf(spent, expected, planned),
    spentOn: spentOn.map((day) => day.date),
    usualOn,
    nextOn,
    today: kind === "set" ? null : elapsed(days, today),
  };
}

function linesFor(input: ProgressInput, period: Period): BudgetLine[] {
  const categories = new Map(input.categories.map((category) => [category.id, category]));
  return input.budgets.flatMap((budget) => {
    const category = categories.get(budget.categoryId);
    const line = category && lineFor(budget, category, input, period);
    return line ? [line] : [];
  });
}

/**
 * The periods an average is over: the reviewed one and those before it in the last
 * `AVERAGE_MONTHS` months, leaving out any that started before money first came in.
 */
function averagePeriods(input: ProgressInput, review: Period): Period[] {
  const from = addMonths(addDays(review.end, 1), -AVERAGE_MONTHS);
  const periods: Period[] = [];
  for (let p: Period | null = review; p && p.start >= from; p = previousPeriod(p, input.spec)) {
    if (input.firstDay === null || p.start < input.firstDay) break;
    periods.push(p);
  }
  return periods;
}

function reviewOf(input: ProgressInput, before: Period | null): Review | null {
  const { firstDay } = input;
  if (!before || firstDay === null || before.start < firstDay) return null;
  const periods = averagePeriods(input, before);
  const lines = linesFor({ ...input, today: before.end }, before);
  const rows = lines.map((line): ReviewRow => {
    const spending = input.days.get(line.category.id) ?? [];
    const total = periods.reduce((all, p) => all + spentIn(spending, p), 0);
    return {
      line,
      gap: line.spent - line.planned,
      average: periods.length > 0 ? Math.round(total / periods.length) : null,
    };
  });
  rows.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  return { period: before, periods: periods.length, rows };
}

/** Budgets in one period: each one's pace, the totals, and how the period before went. */
export function progressOf(input: ProgressInput): BudgetProgress {
  const { spec, period, today } = input;
  const lines = linesFor(input, period);
  const setDates = sum(lines.filter((line) => line.kind === "set"));
  const everyday = sum(lines.filter((line) => line.kind !== "set"));
  const total = sum(lines);

  const budgeted = new Set(lines.map((line) => line.category.id));
  const upTo: Period = { start: period.start, end: today < period.end ? today : period.end };
  let outside = 0;
  for (const category of input.categories)
    if (category.kind === "spending" && category.countsTowardBudgets && !budgeted.has(category.id))
      outside += spentIn(input.days.get(category.id) ?? [], upTo);
  const unsorted = spentIn(input.days.get(null) ?? [], upTo);

  const previous = previousPeriod(period, spec);
  const following = nextPeriod(period, spec);
  return {
    spec,
    period,
    today,
    day: today > period.end ? null : dayOfPeriod(today, period),
    lines,
    total,
    setDates,
    everyday,
    pace: paceOf(everyday.spent, everyday.expected, everyday.planned),
    outside: { cents: outside + unsorted, unsorted },
    previous,
    next: following && following.start <= today ? following : null,
    review: reviewOf(input, previous),
  };
}
