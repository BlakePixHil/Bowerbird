import { unitOf } from "@/components/budgets/budgets";
import { gapStatus, isCalendarMonth } from "@/components/budgets/progress";
import type { InOutMonth } from "@/components/charts";
import type { BudgetProgress, MonthInOut } from "@/lib/access";
import { addMonths, parts, ratio, type PlainDate } from "@/lib/money";
import { rangeMonths } from "./money";

/**
 * The headline numbers and small charts on the Reports page, from the board "Reports". Each card
 * uses the numbers of the page it opens: Money in, money out's months and Budgets' Plan vs reality.
 * Safe in the browser.
 */

/** The short month names, as Australians write them: "Sept", "June". */
const SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "June",
  "July",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** How many months Money in, money out's card shows: the 11 whole ones and this one so far. */
export const CARD_MONTHS = 12;

/** A card with nothing to show yet says when it will. */
export type Waiting = { note: string };

export type InOutCardData = {
  /** "September", or "October so far" before a whole month is in. */
  when: string;
  in: number;
  out: number;
  /** Oldest first, with this month last and partial. */
  months: InOutMonth[];
  /** "NOV 25" and "OCT 26, SO FAR", under the first and last bars. */
  from: string;
  to: string;
};

export type LeftOverCardData = {
  /** "Sept": the last whole month. */
  month: string;
  /** Money in less money out that month. */
  kept: number;
  /** As a share of money in, or null when nothing came in. */
  share: number | null;
  /** The 12 whole months' shares, oldest first, as on Money in, money out. */
  shares: (number | null)[];
  /** Over the same months, the line the report draws. */
  average: number | null;
};

export type PlanCardData = {
  /** Budgets that didn't go over. */
  on: number;
  of: number;
  /** "in Sept", or "last fortnight". */
  when: string;
  /** One per budget, biggest gaps first, as on Plan vs reality. */
  marks: { key: string; name: string; over: boolean; text: string }[];
};

export type ReportsData = {
  inOut: InOutCardData | Waiting;
  leftOver: LeftOverCardData | Waiting;
  plan: PlanCardData | Waiting;
};

export const isWaiting = <T extends object>(data: T | Waiting): data is Waiting => "note" in data;

const firstOf = (date: PlainDate): PlainDate => `${date.slice(0, 7)}-01`;
const keyOf = (start: PlainDate) => start.slice(0, 7);

/** "NOV 25". */
function axisMonth(start: PlainDate): string {
  const { year, month } = parts(start);
  return `${MONTHS[month - 1].slice(0, 3).toUpperCase()} ${String(year).slice(2)}`;
}

/** Last month's money in and out, and the 12 months to this one, this month drawn lighter. */
export function moneyInOutCard(
  sums: readonly MonthInOut[],
  today: PlainDate,
  since: PlainDate | null,
): InOutCardData | Waiting {
  if (!since) return { note: "Shows once your first transactions are in." };
  const by = new Map(sums.map((sum) => [sum.month, sum]));
  const thisMonth = firstOf(today);
  const months = Array.from({ length: CARD_MONTHS }, (_, i): InOutMonth => {
    const start = addMonths(thisMonth, i - CARD_MONTHS + 1);
    const key = keyOf(start);
    const { year, month } = parts(start);
    return {
      key,
      label: axisMonth(start),
      name: `${MONTHS[month - 1].slice(0, 3)} ${year}`,
      inCents: by.get(key)?.in ?? 0,
      outCents: by.get(key)?.out ?? 0,
      partial: start === thisMonth,
    };
  });
  const whole = firstOf(since) < thisMonth;
  const shown = whole ? months.at(-2)! : months.at(-1)!;
  const word = MONTHS[parts(`${shown.key}-01`).month - 1];
  return {
    when: whole ? word : `${word} so far`,
    in: shown.inCents,
    out: shown.outCents,
    months,
    from: months[0].label,
    to: `${months.at(-1)!.label}, SO FAR`,
  };
}

/** The share of pay kept last month, and each whole month's share over Money in, money out's 12. */
export function leftOverCard(
  sums: readonly MonthInOut[],
  today: PlainDate,
  since: PlainDate | null,
): LeftOverCardData | Waiting {
  if (rangeMonths("12m", today, since).length === 0)
    return { note: "Shows after your first whole month." };
  // Always 12 bars, so a month sits in the same place as on Money in, money out. Months before the
  // first data have nothing in, so they have no share and don't change the average.
  const months = Array.from({ length: 12 }, (_, i) => addMonths(firstOf(today), i - 12));
  const by = new Map(sums.map((sum) => [sum.month, sum]));
  const of = (start: PlainDate) => by.get(keyOf(start)) ?? { in: 0, out: 0 };
  const last = months.at(-1)!;
  const totalIn = months.reduce((sum, start) => sum + of(start).in, 0);
  const totalOut = months.reduce((sum, start) => sum + of(start).out, 0);
  return {
    month: SHORT[parts(last).month - 1],
    kept: of(last).in - of(last).out,
    share: ratio(of(last).in - of(last).out, of(last).in),
    shares: months.map((start) => ratio(of(start).in - of(start).out, of(start).in)),
    average: ratio(totalIn - totalOut, totalIn),
  };
}

/** How many budgets stayed on plan in the period before this one, from Budgets' Plan vs reality. */
export function planVsRealityCard(progress: BudgetProgress): PlanCardData | Waiting {
  const unit = unitOf(progress.spec.period);
  if (progress.lines.length === 0) return { note: "Shows once you set your budgets." };
  const review = progress.review;
  if (!review) return { note: `Shows after your first whole ${unit}.` };
  const month = isCalendarMonth(review.period) ? SHORT[parts(review.period.start).month - 1] : null;
  const when = month ? `in ${month}` : `last ${unit}`;
  if (review.rows.length === 0) return { note: `No budgets ran ${when}.` };
  const marks = review.rows.map(({ line, gap }) => ({
    key: line.budget.id,
    name: line.category.name,
    over: gap > 0,
    text: gapStatus(gap).text,
  }));
  return {
    on: marks.filter((mark) => !mark.over).length,
    of: marks.length,
    when,
    marks,
  };
}
