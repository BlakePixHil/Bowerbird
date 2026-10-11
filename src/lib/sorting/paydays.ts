import {
  addDays,
  addMonths,
  clampedDate,
  daysBetween,
  daysInMonth,
  parts,
  type PlainDate,
} from "@/lib/money/dates";
import {
  ABOUT_DAYS,
  paydayAfter,
  paydaysBetween,
  yearlyCents,
  type PayFrequency,
  type PaySchedule,
} from "@/lib/money/paydays";

/**
 * Spotting regular pay in money that came in: deposits from the same payer, of about the same
 * amount, arriving on a pay cycle. What it finds is only a suggestion; a person confirms it on
 * "When are you paid?".
 */

/** Money in, as the finder reads it. */
export type DepositRow = {
  date: PlainDate;
  /** Positive cents. */
  amountCents: number;
  accountId: string;
  /** Who it's from, in a form that's the same every time, such as the shop key. */
  payer: string;
  /** Who it's from, for people to read. */
  payerName: string;
};

/** A regular pay the finder spotted. */
export type FoundPay = PaySchedule & {
  payer: string;
  payerName: string;
  accountId: string;
  /** The usual amount: the middle one of the deposits seen. */
  amountCents: number;
  /** The smallest and biggest deposits seen, the same as `amountCents` when they never change. */
  lowCents: number;
  highCents: number;
  /** The deposits that make up the pattern, oldest first. */
  seen: PlainDate[];
  /** The next payday after today. */
  next: PlainDate;
};

/** How far back the finder looks. */
export const PAY_LOOKBACK_MONTHS = 3;
/** Deposits smaller than this ($100) aren't pay, such as interest or cashback. */
export const PAY_MIN_CENTS = 10_000;
/** A deposit counts as the same pay when it's within 10% of the usual amount. */
const AMOUNT_SLACK = 0.1;
const MIN_SEEN = 3;
/** How much of the cycle has to show up for it to count. */
const MIN_FIT = 0.75;

/** Pay can come a few days early or late around weekends and public holidays. */
const SLACK_DAYS: Record<PayFrequency, number> = {
  weekly: 1,
  fortnightly: 3,
  twice_monthly: 3,
  four_weekly: 3,
  monthly: 3,
};

/** The first day the finder looks at. */
export const payLookbackFrom = (today: PlainDate) =>
  addDays(addMonths(today, -PAY_LOOKBACK_MONTHS), 1);

const middle = (sorted: readonly number[]) => sorted[Math.floor((sorted.length - 1) / 2)];

type Fit = { schedule: PaySchedule; matched: PlainDate[]; score: number; off: number };

/**
 * How well a schedule explains the dates: each payday it expects between the first and last
 * deposit should have one within a few days. Deposits it doesn't expect count against it, so
 * weekly pay doesn't look fortnightly.
 */
function fit(dates: readonly PlainDate[], schedule: PaySchedule): Fit {
  const slack = SLACK_DAYS[schedule.frequency];
  const expected = paydaysBetween(
    schedule,
    addDays(dates[0], -slack),
    addDays(dates[dates.length - 1], slack),
  );
  const left = new Set(dates);
  const matched: PlainDate[] = [];
  let off = 0;
  for (const payday of expected) {
    let best: PlainDate | null = null;
    for (const date of left)
      if (
        Math.abs(daysBetween(payday, date)) <= slack &&
        (!best || Math.abs(daysBetween(payday, date)) < Math.abs(daysBetween(payday, best)))
      )
        best = date;
    if (best) {
      left.delete(best);
      matched.push(best);
      off += Math.abs(daysBetween(payday, best));
    }
  }
  const score = matched.length / (expected.length + left.size);
  return { schedule, matched: matched.sort(), score, off };
}

/**
 * A payday on `day` of the month, in the latest month up to `near`'s that has that day, so 31
 * stays the last day of every month rather than becoming the 30th.
 */
function onDay(day: number, near: PlainDate): PlainDate {
  for (let month = addMonths(near, 0, 1); ; month = addMonths(month, -1, 1)) {
    const { year, month: m } = parts(month);
    if (daysInMonth(year, m) >= day) return clampedDate(year, m, day);
  }
}

/** The schedules worth trying for these dates. */
function schedules(dates: readonly PlainDate[]): PaySchedule[] {
  const last = dates[dates.length - 1];
  // A deposit on the 28th or later may be the last day of the month.
  const days = [
    ...new Set(
      dates.flatMap((date) => (parts(date).day >= 28 ? [parts(date).day, 31] : [parts(date).day])),
    ),
  ];
  const tries: PaySchedule[] = [];
  for (const anchorDate of dates)
    for (const frequency of ["weekly", "fortnightly", "four_weekly"] as const)
      tries.push({ frequency, anchorDate, secondDay: null });
  for (const day of days) {
    tries.push({ frequency: "monthly", anchorDate: onDay(day, last), secondDay: null });
    for (const secondDay of days)
      if (secondDay - day >= 10)
        tries.push({ frequency: "twice_monthly", anchorDate: onDay(day, last), secondDay });
  }
  return tries;
}

/** The best schedule for the dates, or null when none fits well enough. */
function bestFit(dates: readonly PlainDate[]): Fit | null {
  let best: Fit | null = null;
  for (const schedule of schedules(dates)) {
    const tried = fit(dates, schedule);
    if (!best || tried.score > best.score || (tried.score === best.score && tried.off < best.off))
      best = tried;
  }
  return best && best.score >= MIN_FIT && best.matched.length >= MIN_SEEN ? best : null;
}

/** The deposits within 10% of the usual amount, one a day. */
function usualDeposits(rows: readonly DepositRow[]): DepositRow[] {
  const usual = middle(rows.map((row) => row.amountCents).sort((a, b) => a - b));
  const byDay = new Map<PlainDate, DepositRow>();
  for (const row of rows) {
    if (Math.abs(row.amountCents - usual) > usual * AMOUNT_SLACK) continue;
    const had = byDay.get(row.date);
    if (!had || Math.abs(row.amountCents - usual) < Math.abs(had.amountCents - usual))
      byDay.set(row.date, row);
  }
  return [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Regular pay in the deposits, biggest over a year first. `rows` should cover the last
 * `PAY_LOOKBACK_MONTHS` months up to `lastDay`, the newest day the accounts have data for. A pay
 * that should have come by `lastDay` but didn't has stopped, so it's left out.
 */
export function findPays(
  rows: readonly DepositRow[],
  today: PlainDate,
  lastDay: PlainDate = today,
): FoundPay[] {
  const from = payLookbackFrom(today);
  const groups = new Map<string, DepositRow[]>();
  for (const row of rows) {
    if (row.amountCents < PAY_MIN_CENTS || row.date < from || row.date > today) continue;
    const key = `${row.accountId} ${row.payer}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const found: FoundPay[] = [];
  for (const group of groups.values()) {
    const deposits = usualDeposits(group);
    if (deposits.length < MIN_SEEN) continue;
    const best = bestFit(deposits.map((row) => row.date));
    if (!best) continue;
    const { schedule, matched } = best;
    const last = matched[matched.length - 1];
    // Late by more than its slack means it stopped, like a job that ended.
    if (paydayAfter(schedule, last) < addDays(lastDay, -SLACK_DAYS[schedule.frequency])) continue;
    const amounts = deposits
      .filter((row) => matched.includes(row.date))
      .map((row) => row.amountCents)
      .sort((a, b) => a - b);
    const anchored = { ...schedule, anchorDate: anchorNear(schedule, last) };
    found.push({
      ...anchored,
      payer: group[0].payer,
      payerName: deposits[deposits.length - 1].payerName,
      accountId: group[0].accountId,
      amountCents: middle(amounts),
      lowCents: amounts[0],
      highCents: amounts[amounts.length - 1],
      seen: matched,
      next: paydayAfter(anchored, today),
    });
  }
  return found.sort((a, b) => yearlyCents(b) - yearlyCents(a) || (a.payer < b.payer ? -1 : 1));
}

/**
 * The schedule's payday nearest the last deposit, kept as its anchor. For pay that counts in
 * steps that is the deposit itself, unless it came a day or two off the usual day.
 */
function anchorNear(schedule: PaySchedule, last: PlainDate): PlainDate {
  if (schedule.frequency === "monthly" || schedule.frequency === "twice_monthly")
    return schedule.anchorDate;
  const near = paydaysBetween(
    schedule,
    addDays(last, -ABOUT_DAYS.weekly),
    addDays(last, ABOUT_DAYS.weekly),
  );
  return near.reduce((a, b) =>
    Math.abs(daysBetween(a, last)) <= Math.abs(daysBetween(b, last)) ? a : b,
  );
}
