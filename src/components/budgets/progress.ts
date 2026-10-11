import { colourOf } from "@/components/categories/look";
import type { DataColour, IconName, PillTone } from "@/components/ui";
import type { BudgetLine, BudgetProgress, Review } from "@/lib/access";
import { specOf } from "@/lib/access/plan";
import {
  addMonths,
  formatShortDate,
  parts,
  type Pace,
  type Period,
  type PeriodSpec,
} from "@/lib/money";
import { amountText, customDays, dollars, perWords, PERIOD_LABELS, unitOf } from "./budgets";

/**
 * The words on Budgets: the period, each budget's status and kind line, and the parts of
 * "Where it's gone". Safe in the browser.
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

/** A calendar month exactly: the 1st to the day before the next 1st. */
function isCalendarMonth(period: Period): boolean {
  const start = parts(period.start);
  return start.day === 1 && addMonths(period.start, 1) > period.end;
}

/** "October 2026" for a calendar month, otherwise "Fri 9 Oct to Thu 22 Oct". */
export function periodTitle(period: Period): string {
  if (isCalendarMonth(period)) {
    const { year, month } = parts(period.start);
    return `${MONTHS[month - 1]} ${year}`;
  }
  return `${formatShortDate(period.start)} to ${formatShortDate(period.end)}`;
}

/** "October", or "this fortnight" and "that fortnight", for "8 budgets for October". */
export function periodName(period: Period, spec: PeriodSpec, finished: boolean): string {
  return isCalendarMonth(period)
    ? MONTHS[parts(period.start).month - 1]
    : `${finished ? "that" : "this"} ${unitOf(spec.period)}`;
}

/** "Monthly · day 10 of 31", or "Monthly · ended Wed 30 Sep" for one that's over. */
export function periodLine(progress: Pick<BudgetProgress, "spec" | "period" | "day">): string {
  const label = PERIOD_LABELS[progress.spec.period];
  return progress.day
    ? `${label} · day ${progress.day.day} of ${progress.day.of}`
    : `${label} · ended ${formatShortDate(progress.period.end)}`;
}

export type Status = { tone: PillTone | "plain"; icon: IconName; text: string };

/** Pace in words: "$48 over pace", or for a period that's over, "$40 under budget". */
export function paceStatus(pace: Pace, finished: boolean): Status {
  switch (pace.kind) {
    case "over":
      return { tone: "crit", icon: "alert", text: `Over by ${dollars(pace.cents)}` };
    case "ahead":
      return { tone: "warn", icon: "alert", text: `${dollars(pace.cents)} over pace` };
    case "behind":
      return {
        tone: "good",
        icon: "check",
        text: `${dollars(pace.cents)} under ${finished ? "budget" : "pace"}`,
      };
    case "on":
      return { tone: "good", icon: "check", text: finished ? "On budget" : "On pace" };
  }
}

/** Over or under for a period that's over, from the whole plan rather than everyday only. */
export function resultStatus(planned: number, spent: number): Status {
  if (spent > planned)
    return { tone: "crit", icon: "alert", text: `Over by ${dollars(spent - planned)}` };
  return spent < planned
    ? { tone: "good", icon: "check", text: `${dollars(planned - spent)} under budget` }
    : { tone: "good", icon: "check", text: "On budget" };
}

const shortDay = (date: string) => formatShortDate(date, { weekday: false });

/**
 * How a budget is going, as its row says it. Bills say when they were paid or usually come out,
 * since pace doesn't apply to them. A budget that rolls over says what it's carrying.
 */
export function lineStatus(line: BudgetLine, finished: boolean): Status {
  if (line.pace.kind === "over") return paceStatus(line.pace, finished);
  if (line.kind === "set") {
    const paid = line.spentOn;
    if (paid.length === 1)
      return { tone: "plain", icon: "check", text: `Paid on ${shortDay(paid[0])}` };
    if (paid.length > 1)
      return {
        tone: "plain",
        icon: "check",
        text: `Paid ${paid.length} times, last on ${shortDay(paid.at(-1)!)}`,
      };
    if (finished) return { tone: "plain", icon: "clock", text: "Nothing came out" };
    if (line.usualOn && line.expected > 0)
      return {
        tone: "plain",
        icon: "clock",
        text: `Usually out by ${shortDay(line.usualOn)}, not paid yet`,
      };
    if (line.nextOn)
      return {
        tone: "plain",
        icon: "clock",
        text:
          line.nextOn <= line.days.end
            ? `Usually comes out around ${formatShortDate(line.nextOn)}`
            : `Not due until around ${formatShortDate(line.nextOn)}`,
      };
    return { tone: "plain", icon: "clock", text: "Nothing paid yet" };
  }
  if (line.kind === "roll" && line.carried > 0)
    return {
      tone: "plain",
      icon: "rollover",
      text: `Includes ${dollars(line.carried)} rolled over`,
    };
  return finished ? resultStatus(line.planned, line.spent) : paceStatus(line.pace, false);
}

/** The kind under a budget's name on desktop: "Set date", "Flexible" or "Rolls over". */
export const KIND_WORDS: Record<BudgetLine["kind"], string> = {
  set: "Set date",
  flex: "Flexible",
  roll: "Rolls over",
};

/**
 * How often a budget runs, against the page's period: "Monthly", or "Weekly, $207 a week, shown
 * for the month". A trip says its dates.
 */
export function kindLine(line: BudgetLine, view: PeriodSpec): string {
  const spec = specOf(line.budget);
  const amount = amountText(line.budget.amountCents);
  if (spec.period === "custom" && spec.anchor && spec.end) {
    const days = customDays(spec) ?? 0;
    return `Custom, ${amount} for ${shortDay(spec.anchor)} to ${shortDay(spec.end)}${days ? ` (${days} days)` : ""}`;
  }
  const label = PERIOD_LABELS[spec.period];
  // A bill that follows its usual days counts in full when it's due, not a share of it.
  const due = line.kind === "set" && (line.usualOn !== null || line.nextOn !== null);
  const base =
    spec.period === view.period
      ? label
      : `${label}, ${amount} ${perWords(spec)}, ${due ? "counted when it's due" : `shown for the ${unitOf(view.period)}`}`;
  return line.kind === "roll" ? `${base} · anything left rolls over` : base;
}

export type GonePart = { label: string; cents: number; colour: DataColour };

/** "Where it's gone": the biggest five budgets by spending, then everything else together. */
export function goneParts(lines: readonly BudgetLine[], most = 5): GonePart[] {
  const spent = lines.filter((line) => line.spent > 0).sort((a, b) => b.spent - a.spent);
  const shown = spent.length <= most + 1 ? spent : spent.slice(0, most);
  const rest = spent.slice(shown.length).reduce((total, line) => total + line.spent, 0);
  const parts: GonePart[] = shown.map((line) => ({
    label: line.category.name,
    cents: line.spent,
    colour: colourOf(line.category),
  }));
  if (rest > 0) parts.push({ label: "Everything else", cents: rest, colour: "c-other" });
  return parts;
}

/** "Plus $45 spent without a budget, $15 of it not sorted yet." */
export function outsideWords(outside: BudgetProgress["outside"]): string | null {
  if (outside.cents <= 0) return null;
  const sorted = outside.cents - outside.unsorted;
  if (sorted <= 0) return `Plus ${dollars(outside.cents)} not sorted into a category yet.`;
  return outside.unsorted > 0
    ? `Plus ${dollars(outside.cents)} spent without a budget, ${dollars(outside.unsorted)} of it not sorted yet.`
    : `Plus ${dollars(outside.cents)} spent on things without a budget.`;
}

/** A review row's difference: "$63 over", "$40 under" or "On budget". */
export function gapStatus(gap: number): Status {
  if (gap > 0) return { tone: "crit", icon: "alert", text: `${dollars(gap)} over` };
  if (gap < 0) return { tone: "good", icon: "check", text: `${dollars(-gap)} under` };
  return { tone: "good", icon: "check", text: "On budget" };
}

const UNITS_PLURAL: Partial<Record<PeriodSpec["period"], string>> = {
  four_weekly: "four-week stretches",
  twice_monthly: "half months",
};

/** The note on what Plan vs reality's Usually is. */
export function averageWords(review: Review, spec: PeriodSpec): string {
  const unit = unitOf(spec.period);
  if (review.periods === 1)
    return `Usually is that ${unit} too, since it's the only whole one so far.`;
  const units = UNITS_PLURAL[spec.period] ?? `${unit}s`;
  return `Usually is the average per ${unit} over the last ${review.periods} ${units}.`;
}
