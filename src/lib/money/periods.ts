import { assertCents } from "./cents";
import {
  addDays,
  addMonths,
  clampedDate,
  daysBetween,
  isPlainDate,
  parts,
  type PlainDate,
} from "./dates";

/**
 * Budget periods: the stretch of days a budget covers before it starts again, and converting an
 * amount from one period to another. See 04 · Budgets and paydays (Periods per budget, Mixing
 * periods). Dates are plain dates in the household's time zone.
 */

export type BudgetPeriod =
  | "weekly"
  | "fortnightly"
  | "twice_monthly"
  | "four_weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "custom";

export const BUDGET_PERIODS: readonly BudgetPeriod[] = [
  "weekly",
  "fortnightly",
  "twice_monthly",
  "four_weekly",
  "monthly",
  "quarterly",
  "yearly",
  "custom",
];

/**
 * How a budget's periods run, as `budgets` keeps them (`period`, `period_anchor`, `period_end`,
 * `period_second_day`). `anchor` means:
 *
 * - weekly: any day on the weekday it starts (null starts on Monday)
 * - fortnightly and four-weekly: a day a period starts, such as a payday
 * - twice monthly: a date on the first of its two days (null is the 1st and the 15th)
 * - monthly: a date on the day it starts (null is the calendar month)
 * - quarterly: not used; quarters are calendar quarters
 * - yearly: a date on the year's first day, such as 1 July for the financial year (null is the
 *   calendar year)
 * - custom: the first day, with `end` the last
 *
 * Days 29 to 31 fall on a shorter month's last day.
 */
export type PeriodSpec = {
  period: BudgetPeriod;
  anchor: PlainDate | null;
  end?: PlainDate | null;
  secondDay?: number | null;
};

/** A period's first and last days, both included. */
export type Period = { start: PlainDate; end: PlainDate };

/** A Monday, where weekly, fortnightly and four-weekly periods count from when nothing is set. */
const MONDAY = "2024-01-01";

const STEP_DAYS: Partial<Record<BudgetPeriod, number>> = {
  weekly: 7,
  fortnightly: 14,
  four_weekly: 28,
};

function stepping(date: PlainDate, anchor: PlainDate, step: number): Period {
  const start = addDays(anchor, Math.floor(daysBetween(anchor, date) / step) * step);
  return { start, end: addDays(start, step - 1) };
}

/** The start on `day` of the month that's on or before `date`. */
function monthStartOnOrBefore(date: PlainDate, day: number): PlainDate {
  const { year, month } = parts(date);
  const here = clampedDate(year, month, day);
  return here <= date ? here : addMonths(date, -1, day);
}

/** Days of the month a twice-monthly period starts on, smallest first. */
function twiceDays(spec: PeriodSpec): [number, number] {
  const first = spec.anchor ? parts(spec.anchor).day : 1;
  const second = spec.secondDay ?? (spec.anchor ? first : 15);
  return first <= second ? [first, second] : [second, first];
}

/**
 * The period that `date` falls in. Null only for a custom period that doesn't cover the date, or
 * one without its dates.
 */
export function periodContaining(date: PlainDate, spec: PeriodSpec): Period | null {
  const step = STEP_DAYS[spec.period];
  if (step) return stepping(date, spec.anchor ?? MONDAY, step);
  const { year, month } = parts(date);
  switch (spec.period) {
    case "monthly": {
      const day = spec.anchor ? parts(spec.anchor).day : 1;
      const start = monthStartOnOrBefore(date, day);
      return { start, end: addDays(addMonths(start, 1, day), -1) };
    }
    case "twice_monthly": {
      const [a, b] = twiceDays(spec);
      if (a === b) return periodContaining(date, { period: "monthly", anchor: spec.anchor });
      // The latest start on or before the date, from last month's second day onwards.
      const starts = [
        addMonths(date, -1, b),
        clampedDate(year, month, a),
        clampedDate(year, month, b),
        addMonths(date, 1, a),
      ];
      const at = starts.findLastIndex((start) => start <= date);
      return { start: starts[at], end: addDays(starts[at + 1], -1) };
    }
    case "quarterly": {
      const start = clampedDate(year, Math.floor((month - 1) / 3) * 3 + 1, 1);
      return { start, end: addDays(addMonths(start, 3), -1) };
    }
    case "yearly": {
      const first = spec.anchor ? parts(spec.anchor) : { month: 1, day: 1 };
      let start = clampedDate(year, first.month, first.day);
      if (start > date) start = clampedDate(year - 1, first.month, first.day);
      const next = clampedDate(parts(start).year + 1, first.month, first.day);
      return { start, end: addDays(next, -1) };
    }
    case "custom": {
      const { anchor, end } = spec;
      if (!anchor || !end || !isPlainDate(anchor) || !isPlainDate(end) || anchor > end) return null;
      return date >= anchor && date <= end ? { start: anchor, end } : null;
    }
    default:
      return null;
  }
}

/** The period after this one. Custom periods don't repeat, so they have none. */
export function nextPeriod(period: Period, spec: PeriodSpec): Period | null {
  return periodContaining(addDays(period.end, 1), spec);
}

/** The period before this one. Custom periods don't repeat, so they have none. */
export function previousPeriod(period: Period, spec: PeriodSpec): Period | null {
  return periodContaining(addDays(period.start, -1), spec);
}

/** Which day of the period `date` is, for "day 10 of 31". */
export function dayOfPeriod(date: PlainDate, period: Period): { day: number; of: number } {
  return {
    day: daysBetween(period.start, date) + 1,
    of: daysBetween(period.start, period.end) + 1,
  };
}

/** How many of a period fit in a year, as a fraction: weekly is 52, a 10-day custom one 365/10. */
function perYear(spec: PeriodSpec): { times: number; per: number } {
  switch (spec.period) {
    case "weekly":
      return { times: 52, per: 1 };
    case "fortnightly":
      return { times: 26, per: 1 };
    case "twice_monthly":
      return { times: 24, per: 1 };
    case "four_weekly":
      return { times: 13, per: 1 };
    case "monthly":
      return { times: 12, per: 1 };
    case "quarterly":
      return { times: 4, per: 1 };
    case "yearly":
      return { times: 1, per: 1 };
    case "custom": {
      const { anchor, end } = spec;
      if (!anchor || !end || anchor > end) throw new RangeError("a custom period needs its dates");
      return { times: 365, per: daysBetween(anchor, end) + 1 };
    }
  }
}

/** `numerator / denominator` to the nearest whole number, halves away from zero. */
function roundedDivide(numerator: number, denominator: number): number {
  const size = Math.abs(numerator);
  let whole = Math.floor(size / denominator);
  if (2 * (size - whole * denominator) >= denominator) whole += 1;
  return Math.sign(numerator) * whole;
}

/**
 * An amount for one period as the same money over another, through a year: $100 a week is
 * $100 × 52 ÷ 12 = $433.33 a month. Rounds once, to the nearest cent, halves away from zero. A
 * custom period counts as 365 days a year over its own length.
 */
export function convertAmount(cents: number, from: PeriodSpec, to: PeriodSpec): number {
  assertCents(cents);
  const a = perYear(from);
  const b = perYear(to);
  const numerator = cents * a.times * b.per;
  const denominator = a.per * b.times;
  if (!Number.isSafeInteger(numerator)) throw new RangeError("amount is too large to convert");
  return roundedDivide(numerator, denominator);
}
