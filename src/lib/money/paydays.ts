import { addDays, addMonths, clampedDate, daysBetween, parts, type PlainDate } from "./dates";

/**
 * Paydays from a pay cycle. Dates are plain dates, so "today" is the household's today
 * (`todayIn(household.timezone)`), and every payday falls on a calendar day there.
 */

export type PayFrequency = "weekly" | "fortnightly" | "twice_monthly" | "four_weekly" | "monthly";

export const PAY_FREQUENCIES: readonly PayFrequency[] = [
  "weekly",
  "fortnightly",
  "twice_monthly",
  "four_weekly",
  "monthly",
];

/**
 * When an income arrives. Weekly, fortnightly and four-weekly pay counts in steps from
 * `anchorDate`, a known payday. Monthly pay is on `anchorDate`'s day of the month, and twice
 * monthly on that day and `secondDay`. Days past a month's end fall on its last day, so 31 means
 * the last day of every month.
 */
export type PaySchedule = {
  frequency: PayFrequency;
  anchorDate: PlainDate;
  secondDay: number | null;
};

/** An income with its amount, for working out the main one. */
export type PayCycle = PaySchedule & { amountCents: number };

/** A stretch from one payday to the day before the next. */
export type PayPeriod = { start: PlainDate; end: PlainDate };

const STEP_DAYS: Partial<Record<PayFrequency, number>> = {
  weekly: 7,
  fortnightly: 14,
  four_weekly: 28,
};

const PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  fortnightly: 26,
  twice_monthly: 24,
  four_weekly: 13,
  monthly: 12,
};

/** Days between paydays, roughly, for when a pay is late. */
export const ABOUT_DAYS: Record<PayFrequency, number> = {
  weekly: 7,
  fortnightly: 14,
  twice_monthly: 15,
  four_weekly: 28,
  monthly: 30,
};

/** An income's amount over a year, in cents. */
export const yearlyCents = (cycle: Pick<PayCycle, "amountCents" | "frequency">) =>
  cycle.amountCents * PER_YEAR[cycle.frequency];

/** The days of the month a monthly or twice-monthly pay falls on, smallest first. */
function monthDays(schedule: PaySchedule): number[] {
  const first = parts(schedule.anchorDate).day;
  if (schedule.frequency === "monthly" || schedule.secondDay === null) return [first];
  return [...new Set([first, schedule.secondDay])].sort((a, b) => a - b);
}

/** Every payday from `from` to `to`, both included, oldest first. */
export function paydaysBetween(schedule: PaySchedule, from: PlainDate, to: PlainDate): PlainDate[] {
  if (from > to) return [];
  const step = STEP_DAYS[schedule.frequency];
  if (step) {
    const offset = daysBetween(schedule.anchorDate, from);
    let day = addDays(schedule.anchorDate, Math.ceil(offset / step) * step);
    const days: PlainDate[] = [];
    for (; day <= to; day = addDays(day, step)) days.push(day);
    return days;
  }
  const wanted = monthDays(schedule);
  const days: PlainDate[] = [];
  for (let month = addMonths(from, 0, 1); month <= to; month = addMonths(month, 1, 1)) {
    const { year, month: m } = parts(month);
    for (const date of new Set(wanted.map((day) => clampedDate(year, m, day))))
      if (date >= from && date <= to) days.push(date);
  }
  return days;
}

/** The first payday after `date`. */
export function paydayAfter(schedule: PaySchedule, date: PlainDate): PlainDate {
  const step = STEP_DAYS[schedule.frequency];
  if (step) {
    const offset = daysBetween(schedule.anchorDate, date);
    return addDays(schedule.anchorDate, (Math.floor(offset / step) + 1) * step);
  }
  // There's always a payday within two months of any day.
  return paydaysBetween(schedule, addDays(date, 1), addMonths(date, 2))[0];
}

/** The last payday on or before `date`. */
export function paydayOnOrBefore(schedule: PaySchedule, date: PlainDate): PlainDate {
  const step = STEP_DAYS[schedule.frequency];
  if (step) {
    const offset = daysBetween(schedule.anchorDate, date);
    return addDays(schedule.anchorDate, Math.floor(offset / step) * step);
  }
  const days = paydaysBetween(schedule, addMonths(date, -2), date);
  return days[days.length - 1];
}

/**
 * The income a person's pay cycle follows: the one that brings in the most over a year. The first
 * one listed wins a tie.
 */
export function mainIncome<T extends PayCycle>(incomes: readonly T[]): T | null {
  let main: T | null = null;
  for (const income of incomes) if (!main || yearlyCents(income) > yearlyCents(main)) main = income;
  return main;
}

/** A person's next payday after `date`, from their main income. Null when they have none. */
export function nextPayday(incomes: readonly PayCycle[], date: PlainDate): PlainDate | null {
  const main = mainIncome(incomes);
  return main && paydayAfter(main, date);
}

/**
 * The pay periods that overlap `from` to `to`, oldest first, from the person's main income. Each
 * runs from a payday to the day before the next one, so a payday starts a new period. The first
 * and last periods can start before `from` and end after `to`.
 */
export function payPeriods(
  incomes: readonly PayCycle[],
  from: PlainDate,
  to: PlainDate,
): PayPeriod[] {
  const main = mainIncome(incomes);
  if (!main || from > to) return [];
  const periods: PayPeriod[] = [];
  for (let start = paydayOnOrBefore(main, from); start <= to;) {
    const next = paydayAfter(main, start);
    periods.push({ start, end: addDays(next, -1) });
    start = next;
  }
  return periods;
}
