import type { InOutMonth } from "@/components/charts";
import type { DataColour, IconName, PillTone } from "@/components/ui";
import type { CategoryMonth, MonthInOut, SourceMonth } from "@/lib/access";
import { addMonths, formatMoney, formatPercent, parts, ratio, type PlainDate } from "@/lib/money";
import { categoryColour } from "@/lib/sorting/colour";

/**
 * The words and numbers on Money in, money out, from the boards "Money in, money out" and
 * "Desktop: Money in, money out". Every month comes from Activity's totals (`monthlyInOut`,
 * `monthlyOutByCategory` and `monthlyInBySource`), so it matches Activity for the same days. The
 * words state facts only and never guess why a month went the way it did. Safe in the browser.
 */

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

export const RANGES = [
  { value: "12m", label: "12 months" },
  { value: "fy", label: "This financial year" },
] as const;
export type ReportRange = (typeof RANGES)[number]["value"];

export const rangeOf = (value: string | null | undefined): ReportRange =>
  value === "fy" ? "fy" : "12m";

/** How many months "your usual month" averages over: the 6 whole months before the one picked. */
export const USUAL_MONTHS = 6;
/** Where it went lists this many categories, then Everything else. */
export const WENT_ROWS = 8;
/** Where it came from lists this many payers, then Everything else. */
export const CAME_ROWS = 3;
/** Biggest changes from usual lists this many, each at least $10. */
export const CHANGE_ROWS = 3;
const CHANGE_MIN_CENTS = 1_000;

const firstOf = (date: PlainDate): PlainDate => `${date.slice(0, 7)}-01`;
const keyOf = (start: PlainDate) => start.slice(0, 7);
const dollars = (cents: number) => formatMoney(Math.round(cents), { decimals: "never" });
const monthWord = (start: PlainDate) => MONTHS[parts(start).month - 1];

/** The first day of the Australian financial year `today` is in: 1 July. */
export function financialYearStart(today: PlainDate): PlainDate {
  const { year, month } = parts(today);
  return `${month >= 7 ? year : year - 1}-07-01`;
}

/**
 * The whole months a range covers, oldest first, as their first days: the 12 before this one, or
 * this financial year's so far. Never before the month money first came in, since nothing was here
 * yet, and empty until a whole month has passed.
 */
export function rangeMonths(
  range: ReportRange,
  today: PlainDate,
  since: PlainDate | null,
): PlainDate[] {
  if (!since) return [];
  const thisMonth = firstOf(today);
  const start = range === "12m" ? addMonths(thisMonth, -12) : financialYearStart(today);
  const months: PlainDate[] = [];
  for (let month = start; month < thisMonth; month = addMonths(month, 1))
    if (month >= firstOf(since)) months.push(month);
  return months;
}

/** The first day the report needs data from: the usual months before the first month shown. */
export const reportFrom = (months: readonly PlainDate[]): PlainDate =>
  addMonths(months[0], -USUAL_MONTHS);

export type WentRow = {
  /** The category's id, "none" for money not sorted yet, or "rest" for Everything else. */
  key: string;
  name: string;
  cents: number;
  /** The 6-month average, or null before there's a month to compare with. */
  usual: number | null;
  colour: DataColour;
};

export type Change = {
  key: string;
  name: string;
  cents: number;
  usual: number;
  /** This month less the usual month. */
  diff: number;
};

export type CameRow = { key: string; label: string; cents: number; colour: DataColour };

export type ReportMonth = InOutMonth & {
  /** "September", for sentences. */
  word: string;
  /** "September 2026". */
  long: string;
  /** Money in less money out, below zero when more went out. */
  kept: number;
  /** What was kept as a share of money in, or null with no money in. */
  share: number | null;
  went: { total: number; rows: WentRow[]; changes: Change[] };
  came: CameRow[];
};

export type MoneyReport = {
  range: ReportRange;
  months: ReportMonth[];
  totals: { in: number; out: number; kept: number; share: number | null };
  /** A month's average over the range. */
  average: { in: number; out: number };
};

export type ReportCategory = { id: string; name: string; colourSlot: number | null };

export type ReportInput = {
  range: ReportRange;
  /** From `rangeMonths`. */
  months: readonly PlainDate[];
  since: PlainDate | null;
  sums: readonly MonthInOut[];
  /** From `reportFrom(months)` to the end of the last month. */
  byCategory: readonly CategoryMonth[];
  sources: readonly SourceMonth[];
  categories: readonly ReportCategory[];
};

const SOURCE_COLOURS: DataColour[] = ["seq2", "seq3", "seq1"];

function wentIn(
  start: PlainDate,
  input: ReportInput,
  spent: Map<string, Map<string, number>>,
  out: number,
): ReportMonth["went"] {
  const names = new Map(input.categories.map((c) => [c.id, c]));
  const counted = Array.from({ length: USUAL_MONTHS }, (_, i) =>
    addMonths(start, i - USUAL_MONTHS),
  ).filter((month) => input.since !== null && month >= firstOf(input.since));
  const here = spent.get(keyOf(start)) ?? new Map<string, number>();
  const keys = new Set(here.keys());
  for (const month of counted)
    for (const key of spent.get(keyOf(month))?.keys() ?? []) keys.add(key);

  const usualOf = (key: string) =>
    counted.length === 0
      ? null
      : Math.round(
          counted.reduce((sum, month) => sum + (spent.get(keyOf(month))?.get(key) ?? 0), 0) /
            counted.length,
        );
  const all = [...keys].map((key): WentRow => {
    const category = names.get(key);
    return {
      key,
      name: key === "none" ? "Not sorted yet" : (category?.name ?? "Other"),
      cents: here.get(key) ?? 0,
      usual: usualOf(key),
      colour: key === "none" ? "c-other" : categoryColour(category ?? null),
    };
  });

  const spending = all
    .filter((row) => row.cents > 0)
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
  let rows = spending;
  if (spending.length > WENT_ROWS + 1) {
    const shown = new Set(spending.slice(0, WENT_ROWS).map((row) => row.key));
    const rest = all.filter((row) => !shown.has(row.key));
    rows = [
      ...spending.slice(0, WENT_ROWS),
      {
        key: "rest",
        name: "Everything else",
        cents: rest.reduce((sum, row) => sum + row.cents, 0),
        usual: counted.length === 0 ? null : rest.reduce((sum, row) => sum + (row.usual ?? 0), 0),
        colour: "c-other",
      },
    ];
  }

  const changes = all
    .flatMap((row): Change[] =>
      row.usual === null ? [] : [{ ...row, usual: row.usual, diff: row.cents - row.usual }],
    )
    .filter((change) => Math.abs(change.diff) >= CHANGE_MIN_CENTS)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.name.localeCompare(b.name))
    .slice(0, CHANGE_ROWS)
    .map(({ key, name, cents, usual, diff }) => ({ key, name, cents, usual, diff }));
  return { total: out, rows, changes };
}

function cameIn(rows: readonly SourceMonth[]): CameRow[] {
  const sorted = [...rows].sort((a, b) => b.cents - a.cents || a.shop.localeCompare(b.shop));
  const label = (row: SourceMonth) =>
    row.count > 1 ? `${row.shop}, ${row.count} payments` : row.shop;
  const shown = sorted.length > CAME_ROWS + 1 ? sorted.slice(0, CAME_ROWS) : sorted;
  const came = shown.map((row, i) => ({
    key: row.shop,
    label: label(row),
    cents: row.cents,
    colour: SOURCE_COLOURS[i] ?? "c-other",
  }));
  const rest = sorted.slice(shown.length);
  if (rest.length > 0)
    came.push({
      key: "rest",
      label: `Everything else, ${rest.reduce((sum, row) => sum + row.count, 0)} payments`,
      cents: rest.reduce((sum, row) => sum + row.cents, 0),
      colour: "c-other",
    });
  return came;
}

/** Everything the page shows, for every month in the range, so picking a month needs no reload. */
export function moneyReport(input: ReportInput): MoneyReport {
  const sums = new Map(input.sums.map((sum) => [sum.month, sum]));
  const spent = new Map<string, Map<string, number>>();
  for (const row of input.byCategory) {
    const month = spent.get(row.month) ?? new Map<string, number>();
    const key = row.categoryId ?? "none";
    month.set(key, (month.get(key) ?? 0) + row.out);
    spent.set(row.month, month);
  }

  const months = input.months.map((start): ReportMonth => {
    const key = keyOf(start);
    const { year } = parts(start);
    const word = monthWord(start);
    const inCents = sums.get(key)?.in ?? 0;
    const outCents = sums.get(key)?.out ?? 0;
    return {
      key,
      label: word.slice(0, 3).toUpperCase(),
      name: `${word.slice(0, 3)} ${year}`,
      word,
      long: `${word} ${year}`,
      inCents,
      outCents,
      kept: inCents - outCents,
      share: ratio(inCents - outCents, inCents),
      went: wentIn(start, input, spent, outCents),
      came: cameIn(input.sources.filter((row) => row.month === key)),
    };
  });

  const total = (pick: (month: ReportMonth) => number) =>
    months.reduce((sum, month) => sum + pick(month), 0);
  const totalIn = total((month) => month.inCents);
  const totalOut = total((month) => month.outCents);
  const count = Math.max(1, months.length);
  return {
    range: input.range,
    months,
    totals: {
      in: totalIn,
      out: totalOut,
      kept: totalIn - totalOut,
      share: ratio(totalIn - totalOut, totalIn),
    },
    average: { in: Math.round(totalIn / count), out: Math.round(totalOut / count) },
  };
}

/** A piece of a sentence, with the numbers in bold. */
export type Words = { text: string; strong?: boolean }[];

const FRACTIONS: [number, string][] = [
  [1 / 10, "a tenth"],
  [1 / 5, "a fifth"],
  [1 / 4, "a quarter"],
  [1 / 3, "a third"],
  [2 / 5, "two fifths"],
  [1 / 2, "half"],
  [3 / 5, "three fifths"],
  [2 / 3, "two thirds"],
  [3 / 4, "three quarters"],
];

/** "about a quarter" when a share is close to a simple fraction, otherwise "24%". */
export function shareWords(share: number): string {
  const near = FRACTIONS.find(([value]) => Math.abs(share - value) <= 0.025);
  return near ? `about ${near[1]}` : formatPercent(share);
}

/**
 * The sentence at the top: "From October to September you earned $140,560 and spent $106,820.
 * You kept $33,740, about a quarter of your pay."
 */
export function summaryWords(report: MoneyReport): Words {
  const { months, totals } = report;
  const first = months[0];
  const last = months.at(-1)!;
  const when = months.length === 1 ? `In ${first.word}` : `From ${first.word} to ${last.word}`;
  const words: Words = [
    { text: `${when} you earned ` },
    { text: dollars(totals.in), strong: true },
    { text: " and spent " },
    { text: dollars(totals.out), strong: true },
    { text: ". " },
  ];
  if (totals.kept > 0 && totals.share !== null)
    words.push(
      { text: "You kept " },
      { text: dollars(totals.kept), strong: true },
      { text: `, ${shareWords(totals.share)} of your pay.` },
    );
  else if (totals.kept < 0)
    words.push(
      { text: "You spent " },
      { text: dollars(-totals.kept), strong: true },
      { text: " more than you earned." },
    );
  else words.push({ text: "Everything that came in went out again." });
  return words;
}

/** "May kept the most, 37% of pay. December kept the least, 3%." Facts only, never reasons. */
export function keptFacts(report: MoneyReport): string | null {
  const months = report.months.filter((month) => month.share !== null);
  if (months.length === 0) return null;
  const pct = (month: ReportMonth) => formatPercent(month.share);
  if (months.length === 1) {
    const [month] = months;
    return month.kept >= 0
      ? `${month.word} kept ${pct(month)} of pay.`
      : `In ${month.word}, ${dollars(-month.kept)} more went out than came in.`;
  }
  const byShare = [...months].sort((a, b) => b.share! - a.share!);
  const best = byShare[0];
  const worst = byShare.at(-1)!;
  if (best.share === worst.share) return `Every month kept ${pct(best)} of pay.`;
  const top =
    best.kept > 0
      ? `${best.word} kept the most, ${pct(best)} of pay.`
      : `${best.word} came closest to keeping something.`;
  const bottom =
    worst.kept >= 0
      ? `${worst.word} kept the least, ${pct(worst)}.`
      : `In ${worst.word}, ${dollars(-worst.kept)} more went out than came in.`;
  return `${top} ${bottom}`;
}

/** Best and worst months for the desktop KPI: "37% / 3%" and "Kept in May, and in December". */
export function bestAndWorst(report: MoneyReport): { value: string; line: string } | null {
  const months = report.months.filter((month) => month.share !== null);
  if (months.length < 2) return null;
  const byShare = [...months].sort((a, b) => b.share! - a.share!);
  const best = byShare[0];
  const worst = byShare.at(-1)!;
  return {
    value: `${formatPercent(best.share)} / ${formatPercent(worst.share)}`,
    line: `Kept in ${best.word}, and in ${worst.word}`,
  };
}

/** The picked month against the range's average share: better, about usual, or tighter. */
export function monthStatus(
  month: ReportMonth,
  report: MoneyReport,
): { tone: PillTone; icon: IconName; text: string } {
  const usual = report.totals.share;
  if (month.share === null || usual === null)
    return { tone: "quiet", icon: "check", text: "About usual" };
  if (month.share >= usual + 0.02)
    return { tone: "good", icon: "check", text: "Better than usual" };
  if (month.share <= usual - 0.08)
    return { tone: "warn", icon: "alert", text: "Tighter than usual" };
  return { tone: "quiet", icon: "check", text: "About usual" };
}

/** "$1,120 more came in than a usual month", within $50 "About the same as a usual month". */
export function vsUsual(cents: number, usual: number, verb: "came in" | "went out"): string {
  const gap = cents - usual;
  if (Math.abs(gap) < 5_000) return "About the same as a usual month";
  return `${dollars(Math.abs(gap))} ${gap > 0 ? "more" : "less"} ${verb} than a usual month`;
}

/** The phone's line under Where it went: the month's biggest change from usual, as a fact. */
export function changeLine(month: ReportMonth): string | null {
  const [change] = month.went.changes;
  if (!change) return null;
  const name = change.key === "none" ? "Money not sorted yet" : change.name;
  return `${name} was ${dollars(Math.abs(change.diff))} ${change.diff > 0 ? "above" : "below"} usual, the biggest change from your usual month.`;
}

/** "+$1,360" or "−$120". */
export const signedDiff = (cents: number) =>
  `${cents > 0 ? "+" : ""}${formatMoney(cents, { decimals: "never" })}`;

/** "12 months", "This financial year" or "3 months", for the table's total row. */
export const totalLabel = (report: MoneyReport) =>
  report.range === "fy" ? "This financial year" : `${report.months.length} months`;
