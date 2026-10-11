import { describe, expect, it } from "vitest";
import { progressOf, type Income, type ProgressBudget } from "@/lib/access";
import type { DaySpend, PeriodSpec } from "@/lib/money";
import {
  billsLine,
  fillsInWords,
  inOutCard,
  leftToSpend,
  readyTiles,
  setupSteps,
  spendingPace,
  whenWords,
  type SetupFacts,
} from "./home";

const MONTH: PeriodSpec = { period: "monthly", anchor: null };
const OCTOBER = { start: "2026-10-01", end: "2026-10-31" };
const FORTNIGHT: PeriodSpec = { period: "fortnightly", anchor: "2026-10-09" };

const budget = (categoryId: string, amountCents: number, onSetDates = false): ProgressBudget => ({
  id: `b-${categoryId}`,
  scope: "personal",
  ownerMemberId: "olive",
  categoryId,
  amountCents,
  period: "monthly",
  periodAnchor: null,
  periodEnd: null,
  periodSecondDay: null,
  rollover: false,
  onSetDates,
  alert80: true,
  alert100: true,
  since: "2026-03-01",
});

const category = (id: string) => ({
  id,
  name: id,
  icon: null,
  colourSlot: null,
  kind: "spending" as const,
  countsTowardBudgets: true,
});

const on = (...days: [string, number][]): DaySpend[] =>
  days.map(([date, cents]) => ({ date, cents }));

// $701 of everyday spending by Sat 10 Oct, against $2,220 for the month, as on the Home board.
const october = on(
  ["2026-10-01", 3_800],
  ["2026-10-02", 7_400],
  ["2026-10-04", 11_900],
  ["2026-10-07", 20_000],
  ["2026-10-10", 27_000],
);
const september = on(["2026-09-02", 30_000], ["2026-09-09", 18_900], ["2026-09-28", 100_000]);

const progress = (
  more: {
    today?: string;
    spending?: DaySpend[];
    budgets?: ProgressBudget[];
    spec?: PeriodSpec;
    period?: { start: string; end: string };
  } = {},
) =>
  progressOf({
    today: more.today ?? "2026-10-10",
    spec: more.spec ?? MONTH,
    period: more.period ?? OCTOBER,
    budgets: more.budgets ?? [budget("everyday", 222_000), budget("rent", 225_000, true)],
    categories: [category("everyday"), category("rent")],
    days: new Map([
      ["everyday", [...september, ...(more.spending ?? october)]],
      ["rent", on(["2026-09-01", 225_000], ["2026-10-01", 225_000])],
    ]),
    firstDay: "2026-03-01",
  });

describe("left to spend", () => {
  it("shares what's left over the days after today", () => {
    expect(leftToSpend(progress())).toMatchObject({
      title: "Left to spend in October",
      hero: "$1,519",
      line: "of $2,220 for everyday spending. That's about $72 a day for the next 21 days.",
      dayLine: "Today is day 10 of 31",
      spent: 70_100,
      planned: 222_000,
      pace: { tone: "good", text: "On pace" },
    });
  });

  it("says when it's over, and near the end", () => {
    const over = leftToSpend(progress({ spending: on(["2026-10-03", 230_000]) }))!;
    expect(over.hero).toBe("−$80");
    expect(over.line).toBe("$80 over the $2,220 for everyday spending, with 21 days to go.");
    expect(over.pace).toMatchObject({ tone: "crit", text: "Over by $80" });
    expect(leftToSpend(progress({ today: "2026-10-30" }))!.line).toBe(
      "of $2,220 for everyday spending. That's about $1,519 for tomorrow, the last day.",
    );
    expect(leftToSpend(progress({ today: "2026-10-31" }))!.line).toBe(
      "of $2,220 for everyday spending, for the rest of today.",
    );
  });

  it("names a pay cycle's period, and needs an everyday budget", () => {
    const fortnight = progress({
      spec: FORTNIGHT,
      period: { start: "2026-10-09", end: "2026-10-22" },
    });
    expect(leftToSpend(fortnight)!.title).toBe("Left to spend this fortnight");
    expect(leftToSpend(progress({ budgets: [budget("rent", 225_000, true)] }))).toBeNull();
  });

  it("says what bills have come out and what's to come", () => {
    expect(billsLine(progress())).toEqual({ paid: "$2,250 paid", toCome: "$0 still to come" });
    expect(billsLine(progress({ budgets: [budget("everyday", 222_000)] }))).toBeNull();
  });
});

describe("spending pace", () => {
  it("adds up everyday spending day by day, against last month and the plan", () => {
    const pace = spendingPace(progress())!;
    const { chart } = pace;
    expect(chart.label).toBe("Everyday spending in October");
    expect(chart.actual.points).toHaveLength(10);
    expect(chart.actual.points.at(-1)).toEqual({ date: "2026-10-10", cents: 70_100 });
    expect(chart.actual.points[2]).toEqual({ date: "2026-10-03", cents: 11_200 });
    expect(chart.previous).toMatchObject({ name: "September", start: "2026-09-01" });
    expect(chart.previous!.points).toHaveLength(30);
    expect(chart.plan!.points).toEqual([
      { date: "2026-10-01", cents: 7_161 },
      { date: "2026-10-31", cents: 222_000 },
    ]);
    // $701 over 10 days is on course for $2,173 by the 31st.
    expect(chart.forecast).toMatchObject({ label: "On course for $2,173" });
    expect(chart.guides).toEqual([{ cents: 222_000, label: "Plan $2,220" }]);
    // September had $489 by the 10th.
    expect(pace.vsLast).toBe("$212 more than September by this point.");
  });

  it("follows a pay cycle, and stops forecasting on the last day", () => {
    const fortnight = spendingPace(
      progress({ spec: FORTNIGHT, period: { start: "2026-10-09", end: "2026-10-22" } }),
    )!;
    expect(fortnight.chart.label).toBe("Everyday spending this fortnight");
    expect(fortnight.chart.actual.name).toBe("This fortnight");
    expect(fortnight.chart.previous?.name).toBe("Last fortnight");
    expect(fortnight.vsLast).toMatch(/than last fortnight by this point\.$/);
    expect(spendingPace(progress({ today: "2026-10-31" }))!.chart.forecast).toBeUndefined();
  });
});

describe("money in, money out", () => {
  it("draws the bigger one full length and says what's left over", () => {
    expect(inOutCard({ in: 736_500, out: 311_200 }, OCTOBER, MONTH)).toEqual({
      title: "October so far",
      in: "$7,365",
      out: "$3,112",
      inPct: 100,
      outPct: 42.3,
      left: "$4,253",
    });
    expect(inOutCard({ in: 326_400, out: 386_900 }, OCTOBER, MONTH).left).toBe("−$605");
    expect(inOutCard({ in: 0, out: 0 }, OCTOBER, MONTH)).toMatchObject({ inPct: 0, outPct: 0 });
  });

  it("says when each transaction was", () => {
    expect(whenWords("2026-10-10", "2026-10-10")).toBe("Today");
    expect(whenWords("2026-10-09", "2026-10-10")).toBe("Yesterday");
    expect(whenWords("2026-10-08", "2026-10-10")).toBe("Thu 8 Oct");
    expect(whenWords("2025-12-30", "2026-01-02")).toBe("Tue 30 Dec 2025");
  });
});

describe("the first week", () => {
  const pay: Income = {
    id: "pay",
    label: "Salary",
    amountCents: 326_000,
    accountId: null,
    frequency: "fortnightly",
    anchorDate: "2026-10-09",
    secondDay: null,
  };
  const facts: SetupFacts = {
    today: "2026-10-10",
    period: OCTOBER,
    spec: MONTH,
    transactions: 482,
    since: "2026-07-11",
    toCheck: 38,
    accounts: [
      { whose: "mine" },
      { whose: "mine" },
      { whose: "shared" },
      { whose: "shared" },
      { whose: "shared" },
      { whose: "shared" },
    ],
    banks: 2,
    live: 1,
    pay,
    budgets: 0,
  };

  it("lists what's done first, then what's left, with where to go", () => {
    expect(setupSteps(facts).map((step) => [step.title, step.detail, step.href])).toEqual([
      ["Bring in your transactions", "2 banks, live sync once a day", null],
      ["Confirm your payday", "$3,260 every second Friday", null],
      [
        "Sort 38 transactions the app wasn't sure about",
        "Quick yes or no. Each answer can become a rule.",
        "/activity?show=check",
      ],
      ["Set your budgets", "Start from what you usually spend each month", "/budgets/plan"],
      [
        "Add older history from a file",
        "Anything before Sat 11 Jul, from your bank's website.",
        "/import",
      ],
    ]);
  });

  it("starts with bringing transactions in when there are none", () => {
    const none = { ...facts, transactions: 0, since: null, toCheck: 0, pay: null, accounts: [] };
    expect(setupSteps(none).map((step) => [step.key, step.done])).toEqual([
      ["bring", false],
      ["payday", false],
      ["budgets", false],
    ]);
    expect(readyTiles(none)).toEqual([]);
    expect(fillsInWords(none).line).toBe(
      "Once your transactions are in and your budgets are set, Home shows what's left to spend in October, your spending pace and money in, money out.",
    );
  });

  it("ticks off sorting, budgets and history once they're done", () => {
    const later = { ...facts, toCheck: 0, budgets: 6, since: "2026-04-01", live: 0 };
    expect(setupSteps(later).map((step) => [step.key, step.done, step.detail])).toEqual([
      ["bring", true, "6 accounts from bank files"],
      ["payday", true, "$3,260 every second Friday"],
      ["sort", true, "All sorted"],
      ["budgets", true, "6 budgets set"],
      ["history", true, "History back to Wed 1 Apr 2026"],
    ]);
  });

  it("shows what's ready", () => {
    expect(readyTiles(facts).map((tile) => [tile.label, tile.value, tile.detail])).toEqual([
      ["Banks", "2", "Live sync once a day"],
      ["Accounts", "6", "2 yours, 4 joint"],
      ["Transactions", "482", "Since Sat 11 Jul"],
      ["Sorted", "92%", "38 to check"],
    ]);
    expect(fillsInWords(facts)).toEqual({
      title: "Fills in as the month goes on",
      line: "Once your budgets are set, Home shows what's left to spend in October, your spending pace and money in, money out.",
    });
    expect(
      fillsInWords({
        ...facts,
        spec: FORTNIGHT,
        period: { start: "2026-10-09", end: "2026-10-22" },
      }),
    ).toEqual({
      title: "Fills in as the fortnight goes on",
      line: "Once your budgets are set, Home shows what's left to spend this fortnight, your spending pace and money in, money out.",
    });
  });
});
