import type { DayPoint, InOutMonth, MonthPoint, RangePoint } from "@/components/charts";
import { addDays, type PlainDate } from "@/lib/money";

/** Made-up numbers shaped like the design canvas boards. Dollars here, cents in the charts. */
const cents = (dollars: number) => Math.round(dollars * 100);

const series = (start: PlainDate, dollars: readonly number[]): DayPoint[] =>
  dollars.map((d, i) => ({ date: addDays(start, i), cents: cents(d) }));

export const OCT_START = "2026-10-01";
export const OCT_END = "2026-10-31";
export const TODAY = "2026-10-10";

// Spending pace on the Home board: October so far against September and the $2,220 plan.
const OCT_SO_FAR = [38, 112, 164, 231, 298, 352, 418, 507, 611, 701];
const SEPT = [
  52, 131, 198, 240, 322, 401, 455, 520, 598, 689, 742, 801, 887, 964, 1021, 1102, 1188, 1240, 1311,
  1398, 1476, 1530, 1604, 1690, 1795, 1871, 1958, 2105, 2244, 2384,
];
export const PLAN = cents(2220);
const onCourse = cents((701 / 10) * 31);

export const pace = {
  actual: { name: "October", points: series(OCT_START, OCT_SO_FAR), area: true },
  previous: { name: "September", start: "2026-09-01", points: series("2026-09-01", SEPT) },
  plan: {
    name: "Plan",
    points: [
      { date: OCT_START, cents: Math.round(PLAN / 31) },
      { date: OCT_END, cents: PLAN },
    ],
  },
  forecast: {
    name: "Forecast",
    label: `On course for $${Math.round(onCourse / 100).toLocaleString("en-AU")}`,
    points: [
      { date: TODAY, cents: cents(701) },
      { date: OCT_END, cents: onCourse },
    ],
  },
};

// Until payday: the joint account so far, then what's expected, with a likely range.
const BALANCE_SO_FAR = [4630, 4544, 4498, 4410, 4352, 4280, 4205, 4120, 4032, 3940];
const EXPECTED = [
  3940, 3876, 3812, 3748, 3498, 5234, 5170, 5106, 5019, 4955, 4891, 4700, 4636, 4572, 6304, 6240,
  6110, 6046, 5982, 5791, 5727, 5663,
];

export const payday = {
  actual: { name: "Actual", points: series(OCT_START, BALANCE_SO_FAR) },
  forecast: { name: "Expected", points: series(TODAY, EXPECTED) },
  range: {
    name: "Likely range",
    points: EXPECTED.map((d, i): RangePoint => ({
      date: addDays(TODAY, i),
      low: cents(d - i * 28),
      high: cents(d + i * 22),
    })),
  },
  events: [
    { date: "2026-10-14", label: "Origin Energy" },
    { date: "2026-10-18", label: "Netflix" },
    { date: "2026-10-26", label: "Water bill" },
  ],
  markers: [
    { date: "2026-10-15", label: "Partner paid" },
    { date: "2026-10-23", label: "You paid" },
  ],
  callouts: [
    { date: "2026-10-14", cents: cents(3498), label: "Lowest $3,498", strong: true, below: true },
  ],
  alert: cents(1000),
};

// Money in and out on the Money in, money out board: October 2025 to September 2026.
const NAMES = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
const IN = [11170, 11170, 11170, 14430, 11170, 11170, 11170, 14430, 11170, 11170, 11170, 11170];
const OUT = [8500, 8940, 10860, 9120, 8410, 8760, 8330, 9050, 8610, 9480, 8720, 8040];

export const months: InOutMonth[] = NAMES.map((name, i) => {
  const year = i < 3 ? 2025 : 2026;
  return {
    key: `${year}-${String(((i + 9) % 12) + 1).padStart(2, "0")}`,
    label: name[0],
    name: `${name} ${year}`,
    inCents: cents(IN[i]),
    outCents: cents(OUT[i]),
  };
});

// The Reports board: November 2025 to October 2026, with October not over yet.
export const reportMonths: InOutMonth[] = [
  ...months.slice(1).map((m) => ({ ...m, label: m.name.slice(0, 3).toUpperCase() })),
  {
    key: "2026-10",
    label: "OCT",
    name: "Oct 2026 so far",
    inCents: cents(7365),
    outCents: cents(3112),
    partial: true,
  },
];

// Everyday spending on the Activity board: Sun 27 Sep to Sat 10 Oct.
export const fortnight = series(
  "2026-09-27",
  [42, 76, 31, 58, 94, 128, 65, 38, 67, 52, 89, 104, 98, 112],
);

// Net worth on the What we own and owe board.
const NW = [251.4, 252.9, 251.8, 255.6, 257.2, 258.0, 260.9, 262.1, 263.4, 265.0, 267.8, 270.945];
const MONTHS = ["NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP"];
const LONG = [
  "Nov 2025",
  "Dec 2025",
  "Jan 2026",
  "Feb 2026",
  "Mar 2026",
  "Apr 2026",
  "May 2026",
  "Jun 2026",
  "Jul 2026",
  "Aug 2026",
  "Sep 2026",
];

export const netWorth: MonthPoint[] = NW.map((k, i) =>
  i < 11
    ? { label: MONTHS[i], name: `End of ${LONG[i]}`, cents: cents(k * 1000) }
    : { label: "TODAY", name: "Today, Sat 10 Oct", cents: cents(k * 1000) },
);
