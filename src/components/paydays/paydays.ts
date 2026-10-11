import {
  clampedDate,
  dayOfWeek,
  formatMoney,
  formatShortDate,
  parts,
  type PayFrequency,
  type PaySchedule,
  type PlainDate,
} from "@/lib/money";

/**
 * The words and the choices on "When are you paid?": how a pay cycle reads, and what changing
 * how often or the next payday does to it. Safe in the browser.
 */

export const FREQUENCY_LABELS: Record<PayFrequency, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  twice_monthly: "Twice a month",
  four_weekly: "Four-weekly",
  monthly: "Monthly",
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "15th", "22nd", or "last day" for 31, which falls on every month's last day. */
export function dayWords(day: number): string {
  if (day >= 31) return "last day";
  const tens = Math.floor(day / 10) % 10;
  const ones = day % 10;
  const suffix =
    tens !== 1 && ones === 1
      ? "st"
      : tens !== 1 && ones === 2
        ? "nd"
        : tens !== 1 && ones === 3
          ? "rd"
          : "th";
  return `${day}${suffix}`;
}

/** The days of the month, for picking the other twice-monthly payday. */
export const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: i + 1 === 31 ? "Last day of the month" : `The ${dayWords(i + 1)}`,
}));

/** "every second Friday", "on the 15th of each month", "on the 15th and last day of each month". */
export function cycleWords(schedule: PaySchedule): string {
  const weekday = WEEKDAYS[dayOfWeek(schedule.anchorDate)];
  const day = parts(schedule.anchorDate).day;
  switch (schedule.frequency) {
    case "weekly":
      return `every ${weekday}`;
    case "fortnightly":
      return `every second ${weekday}`;
    case "four_weekly":
      return `every fourth ${weekday}`;
    case "monthly":
      return `on the ${dayWords(day)} of each month`;
    case "twice_monthly": {
      const [a, b] = [day, schedule.secondDay ?? day].sort((x, y) => x - y);
      return `on the ${dayWords(a)} and ${dayWords(b)} of each month`;
    }
  }
}

const dollars = (cents: number) => formatMoney(cents, { decimals: "auto", sign: "never" });

/** "$3,260 into Everyday every second Friday". */
export function payHeadline(pay: {
  amountCents: number;
  accountName: string | null;
  schedule: PaySchedule;
}): string {
  const into = pay.accountName ? ` into ${pay.accountName}` : "";
  return `${dollars(pay.amountCents)}${into} ${cycleWords(pay.schedule)}`;
}

/** "Seen 7 times since Fri 17 Jul, $3,260 each time." */
export function seenWords(seen: readonly PlainDate[], low: number, high: number): string {
  const each = low === high ? `${dollars(low)} each time` : `${dollars(low)} to ${dollars(high)}`;
  return `Seen ${seen.length} times since ${formatShortDate(seen[0])}, ${each}.`;
}

/** "13 days", "1 day" or "Today". */
export const daysWords = (days: number) =>
  days === 0 ? "Today" : `${days} ${days === 1 ? "day" : "days"}`;

/**
 * The schedule when someone picks another frequency. Weekly, fortnightly and four-weekly count
 * from `last`, the last payday. Monthly keeps its day. Twice monthly keeps its days when it already
 * was, and otherwise starts on the 15th and the last day, the usual twice-monthly paydays.
 */
export function withFrequency(
  schedule: PaySchedule,
  frequency: PayFrequency,
  last: PlainDate,
): PaySchedule {
  if (frequency === schedule.frequency) return schedule;
  if (frequency === "twice_monthly") {
    const { year, month } = parts(last);
    return { frequency, anchorDate: clampedDate(year, month, 15), secondDay: 31 };
  }
  return { frequency, anchorDate: last, secondDay: null };
}

/**
 * The schedule with `date` as a payday, from "Next payday". Twice-monthly pay moves the day that
 * `date` replaces, the nearer of the two.
 */
export function withPayday(schedule: PaySchedule, date: PlainDate): PaySchedule {
  if (schedule.frequency !== "twice_monthly") return { ...schedule, anchorDate: date };
  const day = parts(date).day;
  if (schedule.secondDay === null || !schedule.anchorDate)
    return { ...schedule, anchorDate: date, secondDay: day >= 20 ? 15 : 31 };
  const first = parts(schedule.anchorDate).day;
  const second = schedule.secondDay;
  return {
    ...schedule,
    anchorDate: date,
    secondDay: Math.abs(day - first) <= Math.abs(day - second) ? second : first,
  };
}
