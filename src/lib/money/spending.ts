import { sumCents } from "./cents";
import { addDays, type PlainDate } from "./dates";

/**
 * What counts as spending, the same on every screen: money out that isn't a transfer between the
 * household's own accounts. Pending rows count, since the money has already gone.
 */
export function spentBy(row: { amountCents: number; notCounted: boolean }): number {
  return row.amountCents < 0 && !row.notCounted ? -row.amountCents : 0;
}

/** Spending on one day, in positive cents. */
export type DaySpend = { date: PlainDate; cents: number };

/** How many weeks before this one make up a usual week. */
export const USUAL_WEEKS = 12;

/** Fewer full weeks of history than this, and there's no usual week to compare with. */
export const MIN_USUAL_WEEKS = 2;

export type WeekSpending = {
  /** The last 14 days, oldest first, ending today. Days with no spending are 0. */
  fortnight: DaySpend[];
  /** Spent today and the six days before. */
  week: number;
  /** Spent in the seven days before that. */
  lastWeek: number;
  /**
   * The middle week of up to `USUAL_WEEKS` full weeks before this one, or null with fewer than
   * `MIN_USUAL_WEEKS` of history. The middle, not the average, so one big week away doesn't make
   * every other week look small.
   */
  usualWeek: number | null;
  /** A usual week shared over seven days, for the typical-day line. */
  usualDay: number | null;
};

/**
 * This week's spending against a usual week. Weeks are rolling: "this week" is today and the six
 * days before, so the comparison is always seven days with seven days. `since` is the first day
 * the view has any transaction, so weeks from before there's any history don't count as $0 weeks.
 */
export function weekSpending(
  days: readonly DaySpend[],
  today: PlainDate,
  since: PlainDate | null,
): WeekSpending {
  const byDate = new Map<PlainDate, number>();
  for (const day of days) byDate.set(day.date, (byDate.get(day.date) ?? 0) + day.cents);
  const spentOn = (date: PlainDate) => byDate.get(date) ?? 0;
  const weekEnding = (end: PlainDate) =>
    sumCents(Array.from({ length: 7 }, (_, i) => spentOn(addDays(end, -i))));

  const fortnight = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(today, i - 13);
    return { date, cents: spentOn(date) };
  });

  const weeks: number[] = [];
  for (let back = 1; back <= USUAL_WEEKS; back++) {
    const end = addDays(today, -7 * back);
    if (since === null || addDays(end, -6) < since) break;
    weeks.push(weekEnding(end));
  }
  const usualWeek = weeks.length >= MIN_USUAL_WEEKS ? middle(weeks) : null;

  return {
    fortnight,
    week: weekEnding(today),
    lastWeek: weekEnding(addDays(today, -7)),
    usualWeek,
    usualDay: usualWeek === null ? null : Math.round(usualWeek / 7),
  };
}

/** The median, rounded to the cent. */
function middle(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[half] : Math.round((sorted[half - 1] + sorted[half]) / 2);
}

export type AgainstUsual = { kind: "more" | "less"; cents: number } | { kind: "about"; cents: 0 };

/**
 * This week against a usual week: within $5 or 5% either way is "about usual". Whole dollars, so
 * the words never say "$0.40 more than usual".
 */
export function againstUsual(week: number, usualWeek: number): AgainstUsual {
  const difference = week - usualWeek;
  const close = Math.max(500, Math.round(usualWeek * 0.05));
  if (Math.abs(difference) < close) return { kind: "about", cents: 0 };
  return { kind: difference > 0 ? "more" : "less", cents: Math.abs(difference) };
}
