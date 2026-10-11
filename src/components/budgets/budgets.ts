import { SET_DATE_CATEGORIES } from "@/config/app";
import type { BudgetDraft, BudgetsRun } from "@/lib/access";
import { specOf } from "@/lib/access/plan";
import {
  addDays,
  convertAmount,
  dayOfWeek,
  daysBetween,
  formatMoney,
  formatShortDate,
  isPlainDate,
  mainIncome,
  parts,
  periodContaining,
  yearlyCents,
  type BudgetPeriod,
  type PayCycle,
  type PaySchedule,
  type PeriodSpec,
  type PlainDate,
} from "@/lib/money";
import { dayWords } from "@/components/paydays/paydays";

/**
 * The words and the maths on Set a budget and Change the plan: how a budget's period reads, what
 * it comes to as a month, and the choices a person makes. Safe in the browser.
 */

export const PERIOD_LABELS: Record<BudgetPeriod, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  twice_monthly: "Twice a month",
  four_weekly: "Four-weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  custom: "Custom",
};

/** One period, for "anything left in one week is added to the next". */
const UNITS: Record<BudgetPeriod, string> = {
  weekly: "week",
  fortnightly: "fortnight",
  twice_monthly: "half month",
  four_weekly: "four-week stretch",
  monthly: "month",
  quarterly: "quarter",
  yearly: "year",
  custom: "stretch",
};

const MONTH: PeriodSpec = { period: "monthly", anchor: null };
const YEAR: PeriodSpec = { period: "yearly", anchor: null };

/** A Monday, where week-based budgets count from when they have no start of their own. */
const MONDAY = "2024-01-01";

/** Where a yearly budget starts by default: 1 July, with the financial year. */
export const FINANCIAL_YEAR = "2024-07-01";

/** Weekly, fortnightly and four-weekly budgets start on a day of the week. */
export const weekBased = (period: BudgetPeriod) =>
  period === "weekly" || period === "fortnightly" || period === "four_weekly";

/** How many days a custom budget covers, or null until both its dates make sense. */
export function customDays(spec: PeriodSpec): number | null {
  const { anchor, end } = spec;
  if (!anchor || !end || !isPlainDate(anchor) || !isPlainDate(end) || end < anchor) return null;
  return daysBetween(anchor, end) + 1;
}

/** What goes after the amount: "a week", "each half", "for 14 days". */
export function perWords(spec: PeriodSpec): string {
  switch (spec.period) {
    case "weekly":
      return "a week";
    case "fortnightly":
      return "a fortnight";
    case "twice_monthly":
      return "each half";
    case "four_weekly":
      return "every 4 weeks";
    case "monthly":
      return "a month";
    case "quarterly":
      return "a quarter";
    case "yearly":
      return "a year";
    case "custom": {
      const days = customDays(spec);
      return days ? `for ${days} ${days === 1 ? "day" : "days"}` : "for these dates";
    }
  }
}

/** Whole dollars, as tables and totals show them. */
export const dollars = (cents: number) => formatMoney(cents, { decimals: "never", sign: "never" });

/** An amount as someone typed it: cents only when there are some. */
export const amountText = (cents: number) =>
  formatMoney(cents, { decimals: "auto", sign: "never" });

/** To the nearest dollar, at least $1, for an amount worked out from another one. */
const wholeDollars = (cents: number) => Math.max(100, Math.round(cents / 100) * 100);

/**
 * The same money as a month, to the cent, through the periods helper. Totals add these up. A custom
 * budget without its dates counts as nothing until it has them.
 */
export function monthlyCents(cents: number, spec: PeriodSpec): number {
  if (spec.period === "custom" && customDays(spec) === null) return 0;
  return convertAmount(cents, spec, MONTH);
}

/** Months aren't whole weeks, so a budget counted in weeks or days is only about so much a month. */
export function isExactMonth(cents: number, spec: PeriodSpec): boolean {
  if (weekBased(spec.period) || spec.period === "custom") return false;
  return convertAmount(convertAmount(cents, spec, MONTH), MONTH, spec) === cents;
}

/** "As a month" on a row: exact when it is, otherwise to the nearest $10 from $100 up. */
export function asMonthCents(cents: number, spec: PeriodSpec): number {
  const month = monthlyCents(cents, spec);
  if (isExactMonth(cents, spec)) return month;
  const step = month >= 10_000 ? 1_000 : 100;
  return Math.round(month / step) * step;
}

/** "About $900 a month, $10,764 a year", or "$2,250 a month, $27,000 a year" when it's exact. */
export function conversionText(cents: number, spec: PeriodSpec): string {
  if (spec.period === "custom") {
    const days = customDays(spec);
    if (!days) return "Pick the first and last days to see it as a month.";
    return `${amountText(cents)} over ${days} ${days === 1 ? "day" : "days"}, about ${dollars(asMonthCents(cents, spec))} a month`;
  }
  const about = isExactMonth(cents, spec) ? "" : "About ";
  return `${about}${dollars(asMonthCents(cents, spec))} a month, ${dollars(convertAmount(cents, spec, YEAR))} a year`;
}

/** The days of the week from Monday, for "Week starts on". `day` counts from 0 for Sunday. */
export const WEEKDAYS = [
  { name: "Monday", short: "M", day: 1 },
  { name: "Tuesday", short: "T", day: 2 },
  { name: "Wednesday", short: "W", day: 3 },
  { name: "Thursday", short: "T", day: 4 },
  { name: "Friday", short: "F", day: 5 },
  { name: "Saturday", short: "S", day: 6 },
  { name: "Sunday", short: "S", day: 0 },
] as const;

/** The day of the week a week-based budget starts on: Monday unless it says otherwise. */
export const startWeekday = (anchor: PlainDate | null) => dayOfWeek(anchor ?? MONDAY);

/**
 * Start a week-based budget on another day of the week, moving its start by as few days as
 * possible, so a fortnight stays close to the one it was.
 */
export function withWeekday(anchor: PlainDate | null, weekday: number): PlainDate {
  const from = anchor ?? MONDAY;
  let shift = (weekday - dayOfWeek(from) + 7) % 7;
  if (shift > 3) shift -= 7;
  return addDays(from, shift);
}

/** Start a fortnight or four weeks a week later, on the same day of the week. */
export const aWeekLater = (anchor: PlainDate | null) => addDays(anchor ?? MONDAY, 7);

/** "This fortnight runs Fri 9 Oct to Thu 22 Oct", for budgets longer than a week. */
export function thisPeriodText(spec: PeriodSpec, today: PlainDate): string | null {
  if (spec.period !== "fortnightly" && spec.period !== "four_weekly") return null;
  const period = periodContaining(today, spec);
  if (!period) return null;
  const which = spec.period === "fortnightly" ? "This fortnight" : "These four weeks";
  return `${which} ${spec.period === "fortnightly" ? "runs" : "run"} ${formatShortDate(period.start)} to ${formatShortDate(period.end)}`;
}

/** The days of the month a monthly or twice-monthly budget can start on. */
export const START_DAYS = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: dayWords(i + 1),
}));

/** A date on the given day of the month, in a month that has every day (31 is the last day). */
export const onDay = (day: number): PlainDate => `2024-01-${String(day).padStart(2, "0")}`;

/** The day of the month a monthly budget starts on: the 1st for calendar months. */
export const monthStartDay = (anchor: PlainDate | null) => (anchor ? parts(anchor).day : 1);

/** A monthly budget starting on this day. The 1st is a calendar month. */
export const monthlyFrom = (day: number): PlainDate | null => (day === 1 ? null : onDay(day));

/** The two days a twice-monthly budget's halves start on, smallest first. */
export function halfDays(spec: Pick<PeriodSpec, "anchor" | "secondDay">): [number, number] {
  const first = spec.anchor ? parts(spec.anchor).day : 1;
  const second = spec.secondDay ?? 15;
  return first <= second ? [first, second] : [second, first];
}

export const YEAR_STARTS = [
  { value: FINANCIAL_YEAR, label: "1 July, with the financial year" },
  { value: "", label: "1 January, with the calendar year" },
];

/** "Quarters start in January, April, July and October", for periods with nothing to pick. */
export const QUARTERS_TEXT = "Quarters start in January, April, July and October";

/** How the months went against the budget, under the chart. `months` is oldest first. */
export function overWords(months: readonly number[], monthCents: number): string {
  const n = months.length;
  const over = months.filter((cents) => cents > monthCents).length;
  if (n === 1)
    return over
      ? "You spent more than this last month."
      : "You didn't go over this amount last month.";
  if (over === 0) return `You didn't go over this amount in any of the last ${n} months.`;
  if (over === n) return `You spent more than this in each of the last ${n} months.`;
  return `You spent more than this in ${over} of the last ${n} months.`;
}

/** The lines under "Tell me at 80%" and "Tell me at 100%". */
export function alertLines(cents: number): { at80: string; at100: string } {
  return {
    at80: `When ${dollars(Math.round((cents * 4) / 5))} of ${amountText(cents)} is spent`,
    at100: `When all ${amountText(cents)} is spent`,
  };
}

/** The line under "Unspent money rolls over". */
export function rolloverNote(on: boolean, cents: number, spec: PeriodSpec): string {
  if (spec.period === "custom")
    return "A custom budget doesn't repeat, so there's nothing to roll over.";
  const unit = UNITS[spec.period];
  return on
    ? `On, so anything left in one ${unit} is added to the next.`
    : `Off, so each ${unit} starts again at ${amountText(cents)}.`;
}

/**
 * What removing a budget leaves, from the board: "Your groceries stay sorted as Groceries. They
 * just won't have a limit or alerts." A name that isn't plural reads as spending.
 */
export function removeWords(name: string): string {
  const lower = name.toLowerCase();
  return lower.endsWith("s")
    ? `Your ${lower} stay sorted as ${name}. They just won't have a limit or alerts.`
    : `Your ${lower} spending stays sorted as ${name}. It just won't have a limit or alerts.`;
}

/** The kinds on Change the plan: bills on set dates, everyday spending, or money that rolls over. */
export type BudgetKind = "set" | "flex" | "roll";

export const KIND_LABELS: Record<BudgetKind, string> = {
  set: "Set date",
  flex: "Flexible",
  roll: "Rolls over",
};

export const kindOf = (budget: Pick<BudgetDraft, "onSetDates" | "rollover">): BudgetKind =>
  budget.rollover ? "roll" : budget.onSetDates ? "set" : "flex";

export const withKind = (draft: BudgetDraft, kind: BudgetKind): BudgetDraft => ({
  ...draft,
  onSetDates: kind === "set",
  rollover: kind === "roll",
});

/** What a kind means for this budget's period. */
export function kindNote(kind: BudgetKind, spec: PeriodSpec): string {
  const custom = spec.period === "custom";
  const unit = UNITS[spec.period];
  switch (kind) {
    case "set":
      return `Comes out on set dates, like a bill, so it counts in full on the day rather than spread across the ${custom ? "dates" : unit}.`;
    case "flex":
      return custom
        ? "Everyday spending, spread across the dates."
        : `Everyday spending, spread across each ${unit}. Anything not spent starts again next ${unit}.`;
    case "roll":
      return `Anything left in one ${unit} is added to the next.`;
  }
}

type PeriodFields = Pick<BudgetDraft, "period" | "periodAnchor" | "periodEnd" | "periodSecondDay">;

const none = { periodAnchor: null, periodEnd: null, periodSecondDay: null };

/** A budget that runs with this pay, from one payday to the next. */
function fromPay(pay: PaySchedule): PeriodFields {
  const day = parts(pay.anchorDate).day;
  switch (pay.frequency) {
    case "weekly":
    case "fortnightly":
    case "four_weekly":
      return { ...none, period: pay.frequency, periodAnchor: pay.anchorDate };
    case "monthly":
      return { ...none, period: "monthly", periodAnchor: monthlyFrom(day) };
    case "twice_monthly":
      return {
        ...none,
        period: "twice_monthly",
        periodAnchor: pay.anchorDate,
        periodSecondDay: pay.secondDay ?? (day >= 20 ? 15 : 31),
      };
  }
}

/** How a new budget runs, from "How should budgets run?" on When are you paid. */
export function startingPeriod(run: BudgetsRun, incomes: readonly PayCycle[]): PeriodFields {
  if (run === "weekly") return { ...none, period: "weekly" };
  const pay = run === "payday" ? mainIncome(incomes) : null;
  return pay ? fromPay(pay) : { ...none, period: "monthly" };
}

/** Words for where a new budget's amount comes from, after "A new budget starts at". */
export function startingWords(run: BudgetsRun, incomes: readonly PayCycle[]): string {
  const period = startingPeriod(run, incomes).period;
  return period === "monthly"
    ? "your 6-month average, as a monthly amount"
    : run === "payday"
      ? "your 6-month average, for each pay cycle"
      : "your 6-month average, as a weekly amount";
}

/**
 * Change how often a budget runs, starting it somewhere sensible: with the person's pay when it
 * comes as often, on the 1st and 16th for halves, and with the financial year for a year. The
 * amount stays as it is, so typing $200 and then picking Weekly makes $200 a week.
 */
export function withPeriod(
  draft: BudgetDraft,
  period: BudgetPeriod,
  incomes: readonly PayCycle[],
  today: PlainDate,
): BudgetDraft {
  if (period === draft.period) return draft;
  const pay = mainIncome(incomes);
  const keepWeekday = weekBased(draft.period) ? draft.periodAnchor : null;
  let fields: PeriodFields;
  switch (period) {
    case "weekly":
      fields = { ...none, period, periodAnchor: keepWeekday };
      break;
    case "fortnightly":
    case "four_weekly":
      fields =
        pay?.frequency === period
          ? fromPay(pay)
          : {
              ...none,
              period,
              periodAnchor:
                keepWeekday ?? periodContaining(today, { period: "weekly", anchor: null })!.start,
            };
      break;
    case "twice_monthly":
      fields =
        pay?.frequency === "twice_monthly"
          ? fromPay(pay)
          : { ...none, period, periodAnchor: onDay(1), periodSecondDay: 16 };
      break;
    case "yearly":
      fields = { ...none, period, periodAnchor: FINANCIAL_YEAR };
      break;
    case "custom":
      fields = { ...none, period, periodAnchor: today, periodEnd: addDays(today, 13) };
      break;
    default:
      fields = { ...none, period };
  }
  return { ...draft, ...fields, rollover: period !== "custom" && draft.rollover };
}

/** The amount for this budget's period that matches a monthly one, to the dollar. */
export function fromMonthly(monthCents: number, spec: PeriodSpec): number {
  if (spec.period === "custom" && customDays(spec) === null) return wholeDollars(monthCents);
  return wholeDollars(convertAmount(monthCents, MONTH, spec));
}

/** A category a budget can be set for, with what it usually comes to. */
export type BudgetCategory = { id: string; name: string; usual: number };

/** A new budget: at the category's usual month, in the period the person's budgets run. */
export function newBudget(
  category: BudgetCategory,
  run: BudgetsRun,
  incomes: readonly PayCycle[],
): BudgetDraft {
  const period = startingPeriod(run, incomes);
  const onSetDates = SET_DATE_CATEGORIES.some(
    (name) => name.toLowerCase() === category.name.trim().toLowerCase(),
  );
  const usual = category.usual > 0 ? category.usual : 10_000;
  const amount = fromMonthly(usual, specOf(period));
  return {
    id: null,
    categoryId: category.id,
    amountCents: amount >= 10_000 ? Math.round(amount / 1_000) * 1_000 : amount,
    ...period,
    rollover: false,
    onSetDates,
    // A bill comes out all at once, so a warning at 80% would only ever come with the 100% one.
    alert80: !onSetDates,
    alert100: true,
  };
}

/** The steps the − and + buttons take: a dollar on a phone, more for bigger amounts on desktop. */
export function stepFor(cents: number, wide: boolean): number {
  if (!wide) return 100;
  return cents >= 100_000 ? 5_000 : cents >= 25_000 ? 1_000 : 500;
}

/** Pay as a month, from every income the person has set. */
export function payAsAMonth(incomes: readonly PayCycle[]): number {
  const year = incomes.reduce((sum, income) => sum + yearlyCents(income), 0);
  return convertAmount(year, YEAR, MONTH);
}

export type PlanTotals = {
  /** Every budget as a month, to the cent. */
  monthCents: number;
  /** The part that comes out on set dates. */
  setDatesCents: number;
  /** The rest: everyday spending, including budgets that roll over. */
  everydayCents: number;
};

/** The plan as a month. Each budget converts through the periods helper, then they add up. */
export function planTotals(drafts: readonly BudgetDraft[]): PlanTotals {
  let setDatesCents = 0;
  let everydayCents = 0;
  for (const draft of drafts) {
    const month = monthlyCents(draft.amountCents, specOf(draft));
    if (kindOf(draft) === "set") setDatesCents += month;
    else everydayCents += month;
  }
  return { monthCents: setDatesCents + everydayCents, setDatesCents, everydayCents };
}

/** Whether two drafts would save the same budget. */
export function sameBudget(a: BudgetDraft, b: BudgetDraft): boolean {
  return (
    a.amountCents === b.amountCents &&
    a.period === b.period &&
    a.periodAnchor === b.periodAnchor &&
    a.periodEnd === b.periodEnd &&
    a.periodSecondDay === b.periodSecondDay &&
    a.rollover === b.rollover &&
    a.onSetDates === b.onSetDates &&
    a.alert80 === b.alert80 &&
    a.alert100 === b.alert100
  );
}
