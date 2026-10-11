import { allocateCents } from "./cents";
import { addDays, daysBetween, type PlainDate } from "./dates";
import {
  convertAmount,
  nextPeriod,
  periodContaining,
  previousPeriod,
  type Period,
  type PeriodSpec,
} from "./periods";
import type { DaySpend } from "./spending";

/**
 * Pace and rollover: how much of a budget falls in a period, where spending would be by today if
 * it went as usual, and what carries over from earlier periods. See 04 · Budgets and paydays
 * (Pace, Rollover). Amounts are positive cents of spending; dates are the household's.
 */

/** Spending on the days of `range`, both ends included. */
export function spentIn(days: readonly DaySpend[], range: Period): number {
  let total = 0;
  for (const day of days) if (day.date >= range.start && day.date <= range.end) total += day.cents;
  return total;
}

/** The days two periods share, or null when they don't meet. */
export function overlap(a: Period, b: Period): Period | null {
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  return start <= end ? { start, end } : null;
}

const lengthOf = (range: Period) => daysBetween(range.start, range.end) + 1;

/** The days a custom budget covers, or null until its dates make sense. */
export function customRange(spec: PeriodSpec): Period | null {
  const { anchor, end } = spec;
  return spec.period === "custom" && anchor && end && anchor <= end ? { start: anchor, end } : null;
}

/**
 * How much of a budget belongs to one of the page's periods. A repeating budget converts through a
 * year, as on Change the plan, so $200 a week is $866.67 of a month. A custom budget is a one-off:
 * the share of its days that fall in the period, and nothing when none do.
 */
export function plannedFor(
  cents: number,
  budget: PeriodSpec,
  view: PeriodSpec,
  period: Period,
): number {
  if (budget.period !== "custom") return convertAmount(cents, budget, view);
  const own = customRange(budget);
  const shared = own && overlap(own, period);
  return shared ? Math.round((cents * lengthOf(shared)) / lengthOf(own)) : 0;
}

/** The days of the period a budget runs in: all of it, or a custom budget's share of it. */
export function daysFor(budget: PeriodSpec, period: Period): Period | null {
  if (budget.period !== "custom") return period;
  const own = customRange(budget);
  return own && overlap(own, period);
}

/** How far through `range` today is: 0 before it starts, 1 once it's over. Today counts. */
export function elapsed(range: Period, today: PlainDate): number {
  if (today < range.start) return 0;
  if (today >= range.end) return 1;
  return (daysBetween(range.start, today) + 1) / lengthOf(range);
}

/** Everyday spending builds up evenly: by day 10 of 31, ten 31sts of the budget. */
export const expectedEvenly = (planned: number, range: Period, today: PlainDate): number =>
  Math.round(planned * elapsed(range, today));

/**
 * When a budget that comes out on set dates, like a bill, usually goes out in `period`: the days
 * it went out in its own last whole period, repeated in each of its periods that meet this one.
 * Rent paid on the 1st of last month lands on the 1st of each month, so a fortnight with the 1st
 * in it holds all of it and the next fortnight none. Each period's share of the amount follows
 * how last period's spending was spread. `next` is the first day after `period`, for "not due
 * until". Null when its last whole period had no spending to go by.
 */
export function billDays(
  cents: number,
  own: PeriodSpec,
  period: Period,
  spending: readonly DaySpend[],
): { days: DaySpend[]; next: PlainDate | null } | null {
  const first = periodContaining(period.start, own);
  const last = first && previousPeriod(first, own);
  if (!first || !last) return null;
  const pattern = spending.filter(
    (day) => day.date >= last.start && day.date <= last.end && day.cents > 0,
  );
  if (pattern.length === 0) return null;
  const shares = allocateCents(
    cents,
    pattern.map((day) => day.cents),
  );
  const offsets = pattern.map((day) => daysBetween(last.start, day.date));

  const days: DaySpend[] = [];
  let next: PlainDate | null = null;
  for (let each: Period | null = first; each && next === null; each = nextPeriod(each, own)) {
    for (let i = 0; i < pattern.length; i++) {
      const moved = addDays(each.start, offsets[i]);
      const date = moved < each.end ? moved : each.end;
      if (date > period.end) next ??= date;
      else if (date >= period.start) days.push({ date, cents: shares[i] });
    }
  }
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { days, next };
}

/** How far ahead of or behind where you'd expect to be counts as more than on pace: 3%. */
export const PACE_SLACK = 0.03;

/**
 * Where spending is against the plan. Over is past the whole budget. Ahead and behind are more than
 * `PACE_SLACK` of the budget either side of what's expected by today: "$48 over pace" and
 * "$151 under pace". Anything closer is on pace.
 */
export type Pace =
  | { kind: "over"; cents: number }
  | { kind: "ahead"; cents: number }
  | { kind: "behind"; cents: number }
  | { kind: "on"; cents: 0 };

export function paceOf(spent: number, expected: number, planned: number): Pace {
  if (spent > planned) return { kind: "over", cents: spent - planned };
  const slack = Math.round(planned * PACE_SLACK);
  if (spent - expected > slack) return { kind: "ahead", cents: spent - expected };
  if (expected - spent > slack) return { kind: "behind", cents: expected - spent };
  return { kind: "on", cents: 0 };
}

/**
 * What rolls into the next period: what each earlier period planned less what it spent, added up
 * from the first, oldest first. It never goes below nothing, so overspending uses up what was
 * carried, and overspending beyond that isn't carried forward.
 */
export function carried(periods: readonly { planned: number; spent: number }[]): number {
  let carry = 0;
  for (const period of periods) carry = Math.max(0, carry + period.planned - period.spent);
  return carry;
}
