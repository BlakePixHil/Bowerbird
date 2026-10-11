import { activityHref } from "@/components/activity/show";
import { dollars, unitOf } from "@/components/budgets/budgets";
import { isCalendarMonth, paceStatus, type Status } from "@/components/budgets/progress";
import { cycleWords } from "@/components/paydays/paydays";
import type { RunningTotalChartProps } from "@/components/charts";
import type { IconName } from "@/components/ui";
import type { BudgetProgress, Income, InOut, Whose } from "@/lib/access";
import {
  addDays,
  addMonths,
  daysBetween,
  formatMoney,
  formatShortDate,
  parts,
  type DaySpend,
  type Period,
  type PeriodSpec,
  type PlainDate,
} from "@/lib/money";

/**
 * The words and numbers on Home, from the boards "Home" and "First run 4: You are set". Everything
 * comes from Budgets' progress for the same period and from Activity's totals, so the numbers
 * match those pages. Safe in the browser.
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

/** "October", or "This fortnight" for a pay cycle: the period as a name. */
export function thisName(period: Period, spec: PeriodSpec): string {
  return isCalendarMonth(period)
    ? MONTHS[parts(period.start).month - 1]
    : `This ${unitOf(spec.period)}`;
}

/** "September", or "Last fortnight": the period before, as a name. */
export function lastName(period: Period, spec: PeriodSpec): string {
  return isCalendarMonth(period)
    ? MONTHS[parts(period.start).month - 1]
    : `Last ${unitOf(spec.period)}`;
}

/** "September" stays as it is; "Last fortnight" becomes "last fortnight" mid-sentence. */
const lower = (name: string) =>
  MONTHS.includes(name) ? name : name[0].toLowerCase() + name.slice(1);

/** "in October" or "this fortnight", after "Left to spend". */
const inName = (period: Period, spec: PeriodSpec) =>
  isCalendarMonth(period) ? `in ${thisName(period, spec)}` : `this ${unitOf(spec.period)}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Money with a real minus sign when it's below zero: −$120. */
const signed = (cents: number) => formatMoney(cents, { decimals: "never" });

export type LeftToSpend = {
  /** "Left to spend in October". */
  title: string;
  /** Planned less spent for everyday spending: below zero once it's over. */
  left: number;
  /** "−$120" or "$1,519". */
  hero: string;
  /** "of $2,220 for everyday spending. That's about $72 a day for the next 21 days." */
  line: string;
  spent: number;
  planned: number;
  /** How far through the period today is, for the bar's tick. */
  today: number;
  /** "Today is day 10 of 31". */
  dayLine: string;
  pace: Status;
};

/**
 * Left to spend: everyday spending only, the same as the pace on Budgets, so bills on set dates
 * don't use it up. The daily amount shares what's left over the days after today.
 */
export function leftToSpend(progress: BudgetProgress): LeftToSpend | null {
  const { everyday, period, spec, day } = progress;
  if (everyday.planned <= 0 || !day) return null;
  const left = everyday.planned - everyday.spent;
  const after = day.of - day.day;
  const plan = dollars(everyday.planned);
  let line: string;
  if (left < 0) {
    const rest = after > 0 ? `, with ${plural(after, "day")} to go` : "";
    line = `${dollars(-left)} over the ${plan} for everyday spending${rest}.`;
  } else if (left === 0) {
    line = `of ${plan} for everyday spending. It's all spent${after > 0 ? `, with ${plural(after, "day")} to go` : ""}.`;
  } else if (after === 0) {
    line = `of ${plan} for everyday spending, for the rest of today.`;
  } else {
    const daily = dollars(Math.round(left / after));
    line =
      after === 1
        ? `of ${plan} for everyday spending. That's about ${daily} for tomorrow, the last day.`
        : `of ${plan} for everyday spending. That's about ${daily} a day for the next ${after} days.`;
  }
  return {
    title: `Left to spend ${inName(period, spec)}`,
    left,
    hero: signed(left),
    line,
    spent: everyday.spent,
    planned: everyday.planned,
    today: day.day / day.of,
    dayLine: `Today is day ${day.day} of ${day.of}`,
    pace: paceStatus(progress.pace, false),
  };
}

/** Bills on set dates so far: "$2,411 paid" and "$549 still to come". Null without any. */
export function billsLine(progress: BudgetProgress): { paid: string; toCome: string } | null {
  const { planned, spent } = progress.setDates;
  if (planned <= 0 && spent <= 0) return null;
  return {
    paid: `${dollars(spent)} paid`,
    toCome: `${dollars(Math.max(0, planned - spent))} still to come`,
  };
}

/** Each day's spending added up from the first day, through `last`, one point a day. */
function runningTotal(start: PlainDate, last: PlainDate, days: readonly DaySpend[]): DaySpend[] {
  const by = new Map(days.map((day) => [day.date, day.cents]));
  const points: DaySpend[] = [];
  let total = 0;
  for (let date = start; date <= last; date = addDays(date, 1)) {
    total += by.get(date) ?? 0;
    points.push({ date, cents: total });
  }
  return points;
}

export type SpendingPace = {
  chart: RunningTotalChartProps;
  /** "$212 more than September by this point.", or null with nothing to compare. */
  vsLast: string | null;
};

/** Within this much of last period at the same point is level with it: $5. */
const LEVEL_CENTS = 500;

/**
 * Spending pace: everyday spending added up through the period, last period in grey, the plan as
 * a hairline and a dotted forecast to the end at the pace so far. Null without everyday budgets.
 */
export function spendingPace(progress: BudgetProgress): SpendingPace | null {
  const { everyday, period, spec, today, day, daily, previous } = progress;
  if (everyday.planned <= 0 || !day) return null;
  const actual = runningTotal(period.start, today, daily.current);
  const now = actual.at(-1)?.cents ?? 0;
  const name = thisName(period, spec);

  // Last period, as far as this one is long, so the lines compare day for day.
  const length = daysBetween(period.start, period.end);
  const before =
    previous && daily.previous
      ? runningTotal(
          previous.start,
          addDays(previous.start, Math.min(length, daysBetween(previous.start, previous.end))),
          daily.previous,
        )
      : null;
  const beforeName = previous ? lastName(previous, spec) : "";
  let vsLast: string | null = null;
  if (before && before.length > 0) {
    const then = (before[Math.min(day.day, before.length) - 1] ?? before.at(-1)!).cents;
    const gap = now - then;
    vsLast =
      Math.abs(gap) < LEVEL_CENTS
        ? `Level with ${lower(beforeName)} at this point.`
        : `${dollars(Math.abs(gap))} ${gap > 0 ? "more" : "less"} than ${lower(beforeName)} by this point.`;
  }

  const onCourse = Math.round((now * day.of) / day.day);
  const ends = today >= period.end;
  return {
    chart: {
      label: `Everyday spending ${isCalendarMonth(period) ? `in ${name}` : lower(name)}`,
      start: period.start,
      end: period.end,
      tone: "neg",
      today,
      actual: { name, points: actual, area: true },
      previous: before ? { name: beforeName, start: previous!.start, points: before } : undefined,
      plan: {
        name: "Plan",
        points: [
          { date: period.start, cents: Math.round(everyday.planned / day.of) },
          { date: period.end, cents: everyday.planned },
        ],
      },
      forecast: ends
        ? undefined
        : {
            name: "Forecast",
            label: `On course for ${dollars(onCourse)}`,
            points: [
              { date: today, cents: now },
              { date: period.end, cents: onCourse },
            ],
          },
      guides: [{ cents: everyday.planned, label: `Plan ${dollars(everyday.planned)}` }],
      callouts: [{ date: today, cents: now, label: dollars(now), strong: true }],
      table: "hidden",
    },
    vsLast,
  };
}

export type InOutCard = {
  title: string;
  in: string;
  out: string;
  /** Bar lengths, as percentages of the bigger one. */
  inPct: number;
  outPct: number;
  /** What's left over so far: money in less money out. */
  left: string;
};

/** Money in, money out so far this period, and what's left over. */
export function inOutCard(money: InOut, period: Period, spec: PeriodSpec): InOutCard {
  const most = Math.max(money.in, money.out);
  const pct = (cents: number) => (most > 0 ? Math.round((cents / most) * 1000) / 10 : 0);
  return {
    title: `${thisName(period, spec)} so far`,
    in: dollars(money.in),
    out: dollars(money.out),
    inPct: pct(money.in),
    outPct: pct(money.out),
    left: signed(money.in - money.out),
  };
}

/** "Today", "Yesterday", "Fri 9 Oct", for the second line of a row on Latest. */
export function whenWords(date: PlainDate, today: PlainDate): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return formatShortDate(date, { year: parts(date).year !== parts(today).year });
}

/** What Home knows about how far setup has got, for the first-week state. */
export type SetupFacts = {
  today: PlainDate;
  /** The period Home shows, for "what's left to spend in October". */
  period: Period;
  spec: PeriodSpec;
  /** Transactions the viewer can see, the first one's day, and how many are left to check. */
  transactions: number;
  since: PlainDate | null;
  toCheck: number;
  /** Accounts the viewer sees in full, by whose they are. */
  accounts: readonly { whose: Whose }[];
  /** Different banks behind those accounts. */
  banks: number;
  /** Live sync connections. */
  live: number;
  /** The person's main pay, once they've set it. */
  pay: Income | null;
  /** Budgets in the period Home shows. */
  budgets: number;
};

export type SetupStep = {
  key: string;
  title: string;
  detail: string;
  done: boolean;
  /** Where to go to do it; nothing once it's done. */
  href: string | null;
};

/** History back this many whole months is enough for averages: the same 6 as Budgets. */
const ENOUGH_MONTHS = 6;

/**
 * The setup checklist, done steps first. Steps for features that aren't built yet, such as putting
 * the app on the Home Screen, stay out until they are.
 */
export function setupSteps(facts: SetupFacts): SetupStep[] {
  const steps: SetupStep[] = [];
  const has = facts.transactions > 0;
  steps.push({
    key: "bring",
    title: "Bring in your transactions",
    detail: has
      ? facts.live > 0
        ? `${plural(facts.banks, "bank")}, live sync once a day`
        : `${plural(facts.accounts.length, "account")} from bank files`
      : "Import a file from your bank's website, or connect live sync",
    done: has,
    href: has ? null : "/import",
  });
  const pay = facts.pay;
  steps.push({
    key: "payday",
    title: "Confirm your payday",
    detail: pay
      ? `${dollars(pay.amountCents)} ${cycleWords(pay)}`
      : "So your budgets can run from payday to payday",
    done: pay !== null,
    href: pay ? null : "/paydays",
  });
  if (has)
    steps.push(
      facts.toCheck > 0
        ? {
            key: "sort",
            title: `Sort ${plural(facts.toCheck, "transaction")} the app wasn't sure about`,
            detail: "Quick yes or no. Each answer can become a rule.",
            done: false,
            href: activityHref("check", ""),
          }
        : {
            key: "sort",
            title: "Sort the transactions the app wasn't sure about",
            detail: "All sorted",
            done: true,
            href: null,
          },
    );
  steps.push({
    key: "budgets",
    title: "Set your budgets",
    detail:
      facts.budgets > 0
        ? `${plural(facts.budgets, "budget")} set`
        : "Start from what you usually spend each month",
    done: facts.budgets > 0,
    href: facts.budgets > 0 ? null : "/budgets/plan",
  });
  if (has && facts.since) {
    const enough = facts.since <= addMonths(`${facts.today.slice(0, 7)}-01`, -ENOUGH_MONTHS);
    steps.push({
      key: "history",
      title: "Add older history from a file",
      detail: enough
        ? `History back to ${formatShortDate(facts.since, { year: true })}`
        : `Anything before ${formatShortDate(facts.since)}, from your bank's website.`,
      done: enough,
      href: enough ? null : "/import",
    });
  }
  return [...steps.filter((step) => step.done), ...steps.filter((step) => !step.done)];
}

export type ReadyTile = {
  icon: IconName;
  label: string;
  value: string;
  detail: string;
  /** For Sorted: how much, as a percentage, for the bar. */
  pct?: number;
};

/** "2 yours, 4 joint". */
function accountsWords(accounts: readonly { whose: Whose }[]): string {
  const count = (whose: Whose) => accounts.filter((account) => account.whose === whose).length;
  const words = [
    count("mine") > 0 && `${count("mine")} yours`,
    count("shared") > 0 && `${count("shared")} joint`,
    count("partner") > 0 && `${count("partner")} your partner's`,
  ].filter(Boolean);
  return words.join(", ");
}

/** What's ready, in the setup card: banks, accounts, transactions and how many are sorted. */
export function readyTiles(facts: SetupFacts): ReadyTile[] {
  if (facts.transactions === 0) return [];
  const sorted = Math.floor(((facts.transactions - facts.toCheck) / facts.transactions) * 100);
  const tiles: ReadyTile[] = [];
  if (facts.banks > 0)
    tiles.push({
      icon: "bank",
      label: facts.banks === 1 ? "Bank" : "Banks",
      value: String(facts.banks),
      detail: facts.live > 0 ? "Live sync once a day" : "From bank files",
    });
  tiles.push(
    {
      icon: "card",
      label: facts.accounts.length === 1 ? "Account" : "Accounts",
      value: String(facts.accounts.length),
      detail: accountsWords(facts.accounts),
    },
    {
      icon: "list",
      label: "Transactions",
      value: facts.transactions.toLocaleString("en-AU"),
      detail: facts.since
        ? `Since ${formatShortDate(facts.since, { year: facts.since.slice(0, 4) !== facts.today.slice(0, 4) })}`
        : "",
    },
    {
      icon: "check-circle",
      label: "Sorted",
      value: `${sorted}%`,
      detail:
        facts.toCheck > 0 ? `${facts.toCheck.toLocaleString("en-AU")} to check` : "All of them",
      pct: sorted,
    },
  );
  return tiles;
}

/** "Fills in as the month goes on", and what it's waiting for. */
export function fillsInWords(facts: SetupFacts): { title: string; line: string } {
  const month = isCalendarMonth(facts.period);
  const when = month
    ? `in ${thisName(facts.period, facts.spec)}`
    : `this ${unitOf(facts.spec.period)}`;
  const waiting =
    facts.transactions === 0 && facts.budgets === 0
      ? "Once your transactions are in and your budgets are set"
      : facts.transactions === 0
        ? "Once your transactions are in"
        : "Once your budgets are set";
  return {
    title: `Fills in as the ${month ? "month" : unitOf(facts.spec.period)} goes on`,
    line: `${waiting}, Home shows what's left to spend ${when}, your spending pace and money in, money out.`,
  };
}
