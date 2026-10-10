/**
 * Plain calendar dates as "YYYY-MM-DD" strings. Bank dates have no time or time zone, so the app
 * keeps them as plain dates and does day arithmetic in UTC, where every day is 24 hours long.
 */

export type PlainDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isPlainDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function toUtc(date: PlainDate): Date {
  if (!isPlainDate(date)) throw new RangeError(`not a date: ${date}`);
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(date: Date): PlainDate {
  return date.toISOString().slice(0, 10);
}

/** Today's date in a time zone, such as the household's Australia/Sydney. */
export function todayIn(timeZone: string, now: Date = new Date()): PlainDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(date: PlainDate, days: number): PlainDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: PlainDate, to: PlainDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** 0 is Sunday, 6 is Saturday. */
export function dayOfWeek(date: PlainDate): number {
  return toUtc(date).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Build a date, moving days past the month's end back to its last day (31 Feb → 28 or 29 Feb). */
export function clampedDate(year: number, month: number, day: number): PlainDate {
  const safeDay = Math.min(day, daysInMonth(year, month));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

export function parts(date: PlainDate): { year: number; month: number; day: number } {
  const d = toUtc(date);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Add calendar months, keeping the day where possible (31 Jan + 1 month → 28 or 29 Feb). */
export function addMonths(date: PlainDate, months: number, day?: number): PlainDate {
  const p = parts(date);
  const index = p.year * 12 + (p.month - 1) + months;
  return clampedDate(Math.floor(index / 12), (index % 12) + 1, day ?? p.day);
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * "Sat 10 Oct", the date style used on screen. Adds the year when asked, "Sat 10 Oct 2026", and
 * leaves out the day of the week for tight spaces, "10 Oct".
 */
export function formatShortDate(
  date: PlainDate,
  options: { year?: boolean; weekday?: boolean } = {},
): string {
  const p = parts(date);
  const dayMonth = `${p.day} ${SHORT_MONTHS[p.month - 1]}`;
  const text = options.weekday === false ? dayMonth : `${SHORT_DAYS[dayOfWeek(date)]} ${dayMonth}`;
  return options.year ? `${text} ${p.year}` : text;
}
