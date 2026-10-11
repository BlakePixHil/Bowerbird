import { describe, expect, it } from "vitest";
import { progressOf, type ProgressBudget } from "@/lib/access";
import type { DaySpend, PeriodSpec } from "@/lib/money";
import { leftOverCard, moneyInOutCard, planVsRealityCard } from "./cards";

const TODAY = "2026-10-11";
const SUMS = [
  { month: "2026-06", in: 652_000, out: 500_000 },
  { month: "2026-07", in: 652_000, out: 480_000 },
  { month: "2026-08", in: 978_000, out: 700_000 },
  { month: "2026-09", in: 652_000, out: 650_000 },
  { month: "2026-10", in: 326_000, out: 311_200 },
];

describe("Money in, money out's card", () => {
  it("shows last month and the 12 months to this one, this month lighter", () => {
    const card = moneyInOutCard(SUMS, TODAY, "2026-06-20");
    expect(card).toMatchObject({
      when: "September",
      in: 652_000,
      out: 650_000,
      from: "NOV 25",
      to: "OCT 26, SO FAR",
    });
    if ("note" in card) throw new Error("expected numbers");
    expect(card.months).toHaveLength(12);
    expect(card.months.filter((month) => month.partial).map((month) => month.key)).toEqual([
      "2026-10",
    ]);
    // Months before the first transaction stay empty.
    expect(card.months[0]).toMatchObject({ key: "2025-11", inCents: 0, outCents: 0 });
  });

  it("shows this month so far until a whole month is in, and waits with nothing at all", () => {
    expect(moneyInOutCard(SUMS, TODAY, "2026-10-02")).toMatchObject({
      when: "October so far",
      in: 326_000,
      out: 311_200,
    });
    expect(moneyInOutCard([], TODAY, null)).toEqual({
      note: "Shows once your first transactions are in.",
    });
  });
});

describe("What's left over's card", () => {
  it("shows last month's share kept against the report's 12-month average", () => {
    const card = leftOverCard(SUMS, TODAY, "2026-06-20");
    if ("note" in card) throw new Error("expected numbers");
    expect(card.month).toBe("Sept");
    expect(card.kept).toBe(2_000);
    expect(card.share).toBeCloseTo(2_000 / 652_000);
    // October to May have nothing in, so they have no share.
    expect(card.shares).toHaveLength(12);
    expect(card.shares.slice(0, 8)).toEqual(Array(8).fill(null));
    expect(card.shares[10]).toBeCloseTo(278_000 / 978_000);
    // The same as Money in, money out's average: all kept over all money in.
    expect(card.average).toBeCloseTo(604_000 / 2_934_000);
  });

  it("waits for the first whole month", () => {
    expect(leftOverCard(SUMS, TODAY, "2026-10-02")).toEqual({
      note: "Shows after your first whole month.",
    });
  });
});

const MONTH: PeriodSpec = { period: "monthly", anchor: null };
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
  name: id[0].toUpperCase() + id.slice(1),
  icon: null,
  colourSlot: null,
  kind: "spending" as const,
  countsTowardBudgets: true,
});

const on = (...days: [string, number][]): DaySpend[] =>
  days.map(([date, cents]) => ({ date, cents }));

const progress = (
  budgets: ProgressBudget[],
  more: { spec?: PeriodSpec; period?: { start: string; end: string }; firstDay?: string } = {},
) =>
  progressOf({
    today: TODAY,
    spec: more.spec ?? MONTH,
    period: more.period ?? { start: "2026-10-01", end: "2026-10-31" },
    budgets,
    categories: [category("groceries"), category("rent"), category("fun")],
    days: new Map([
      ["groceries", on(["2026-09-02", 60_000], ["2026-09-20", 30_000], ["2026-10-02", 9_000])],
      ["rent", on(["2026-09-01", 225_000], ["2026-10-01", 225_000])],
      ["fun", on(["2026-09-12", 4_000])],
    ]),
    firstDay: more.firstDay ?? "2026-03-01",
  });

describe("Plan vs reality's card", () => {
  it("counts the budgets that didn't go over last period, biggest gaps first", () => {
    const card = planVsRealityCard(
      progress([budget("groceries", 80_000), budget("rent", 225_000, true), budget("fun", 10_000)]),
    );
    expect(card).toMatchObject({ on: 2, of: 3, when: "in Sept" });
    if ("note" in card) throw new Error("expected numbers");
    expect(card.marks.map(({ name, over, text }) => [name, over, text])).toEqual([
      ["Groceries", true, "$100 over"],
      ["Fun", false, "$60 under"],
      ["Rent", false, "On budget"],
    ]);
  });

  it("names a pay cycle's period by its unit", () => {
    const card = planVsRealityCard(
      progress([budget("groceries", 80_000)], {
        spec: FORTNIGHT,
        period: { start: "2026-10-09", end: "2026-10-22" },
      }),
    );
    expect(card).toMatchObject({ when: "last fortnight" });
  });

  it("waits for budgets, then for a whole period", () => {
    expect(planVsRealityCard(progress([]))).toEqual({ note: "Shows once you set your budgets." });
    expect(
      planVsRealityCard(progress([budget("rent", 225_000)], { firstDay: "2026-10-01" })),
    ).toEqual({ note: "Shows after your first whole month." });
  });
});
