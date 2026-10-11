import { describe, expect, it } from "vitest";
import type { BudgetDraft } from "@/lib/access";
import type { PayCycle, PeriodSpec } from "@/lib/money";
import {
  alertLines,
  asMonthCents,
  conversionText,
  fromMonthly,
  halfDays,
  kindNote,
  kindOf,
  newBudget,
  overWords,
  payAsAMonth,
  perWords,
  planTotals,
  rolloverNote,
  startingPeriod,
  thisPeriodText,
  withKind,
  withPeriod,
  withWeekday,
} from "./budgets";

const spec = (period: PeriodSpec["period"], more: Partial<PeriodSpec> = {}): PeriodSpec => ({
  period,
  anchor: null,
  ...more,
});

const draft = (more: Partial<BudgetDraft> = {}): BudgetDraft => ({
  id: null,
  categoryId: "groceries",
  amountCents: 20_000,
  period: "weekly",
  periodAnchor: null,
  periodEnd: null,
  periodSecondDay: null,
  rollover: false,
  onSetDates: false,
  alert80: true,
  alert100: true,
  ...more,
});

const fortnightlyPay: PayCycle = {
  frequency: "fortnightly",
  anchorDate: "2026-10-09",
  secondDay: null,
  amountCents: 326_000,
};

describe("the plan's totals", () => {
  it("adds a weekly groceries budget and a monthly rent budget up as a month", () => {
    const groceries = draft({ amountCents: 20_000, period: "weekly" });
    const rent = draft({
      categoryId: "housing",
      amountCents: 225_000,
      period: "monthly",
      onSetDates: true,
    });
    // $200 × 52 ÷ 12 = $866.67, shown as about $870; rent is exactly $2,250.
    expect(asMonthCents(groceries.amountCents, spec("weekly"))).toBe(87_000);
    expect(asMonthCents(rent.amountCents, spec("monthly"))).toBe(225_000);
    expect(planTotals([groceries, rent])).toEqual({
      monthCents: 311_667,
      setDatesCents: 225_000,
      everydayCents: 86_667,
    });
  });

  it("counts every period through a year", () => {
    const month = (amountCents: number, period: PeriodSpec["period"], more = {}) =>
      planTotals([draft({ amountCents, period, ...more })]).monthCents;
    expect(month(20_000, "fortnightly")).toBe(43_333);
    expect(month(10_000, "twice_monthly")).toBe(20_000);
    expect(month(10_000, "four_weekly")).toBe(10_833);
    expect(month(30_000, "quarterly")).toBe(10_000);
    expect(month(120_000, "yearly", { periodAnchor: "2024-07-01" })).toBe(10_000);
    // 14 days of $1,400 is $100 a day, 365 ÷ 12 days in a month.
    expect(month(140_000, "custom", { periodAnchor: "2027-04-02", periodEnd: "2027-04-15" })).toBe(
      304_167,
    );
    // A custom budget without its dates counts as nothing yet.
    expect(month(140_000, "custom", { periodAnchor: "2027-04-02" })).toBe(0);
  });
});

describe("words", () => {
  it("says what the amount is for", () => {
    expect(perWords(spec("weekly"))).toBe("a week");
    expect(perWords(spec("twice_monthly"))).toBe("each half");
    expect(perWords(spec("four_weekly"))).toBe("every 4 weeks");
    expect(perWords(spec("custom", { anchor: "2027-04-02", end: "2027-04-15" }))).toBe(
      "for 14 days",
    );
  });

  it("converts as the board does: about, unless the month is exact", () => {
    expect(conversionText(20_700, spec("weekly"))).toBe("About $900 a month, $10,764 a year");
    expect(conversionText(225_000, spec("monthly"))).toBe("$2,250 a month, $27,000 a year");
    expect(conversionText(10_000, spec("quarterly"))).toBe("About $33 a month, $400 a year");
    expect(conversionText(5_000, spec("twice_monthly"))).toBe("$100 a month, $1,200 a year");
    expect(
      conversionText(140_000, spec("custom", { anchor: "2027-04-02", end: "2027-04-15" })),
    ).toBe("$1,400 over 14 days, about $3,040 a month");
  });

  it("says how often the last months went over", () => {
    const months = [86_100, 84_100, 82_100, 86_800, 89_700, 93_200];
    expect(overWords(months, 90_000)).toBe("You spent more than this in 1 of the last 6 months.");
    expect(overWords(months, 100_000)).toBe(
      "You didn't go over this amount in any of the last 6 months.",
    );
    expect(overWords(months, 50_000)).toBe(
      "You spent more than this in each of the last 6 months.",
    );
    expect(overWords([10_000], 5_000)).toBe("You spent more than this last month.");
  });

  it("says when alerts come and what rollover does", () => {
    expect(alertLines(20_700)).toEqual({
      at80: "When $166 of $207 is spent",
      at100: "When all $207 is spent",
    });
    expect(rolloverNote(true, 20_700, spec("weekly"))).toBe(
      "On, so anything left in one week is added to the next.",
    );
    expect(rolloverNote(false, 20_700, spec("weekly"))).toBe(
      "Off, so each week starts again at $207.",
    );
    expect(rolloverNote(false, 20_700, spec("custom"))).toBe(
      "A custom budget doesn't repeat, so there's nothing to roll over.",
    );
  });

  it("says what each kind means", () => {
    expect(kindNote("set", spec("monthly"))).toBe(
      "Comes out on set dates, like a bill, so it counts in full on the day rather than spread across the month.",
    );
    expect(kindNote("flex", spec("fortnightly"))).toBe(
      "Everyday spending, spread across each fortnight. Anything not spent starts again next fortnight.",
    );
    expect(kindNote("roll", spec("quarterly"))).toBe(
      "Anything left in one quarter is added to the next.",
    );
  });

  it("says which fortnight it is", () => {
    expect(thisPeriodText(spec("fortnightly", { anchor: "2026-10-09" }), "2026-10-11")).toBe(
      "This fortnight runs Fri 9 Oct to Thu 22 Oct",
    );
    expect(thisPeriodText(spec("weekly"), "2026-10-11")).toBeNull();
  });
});

describe("choices", () => {
  it("has one kind at a time", () => {
    expect(kindOf(withKind(draft({ rollover: true }), "set"))).toBe("set");
    expect(withKind(draft({ onSetDates: true }), "roll")).toMatchObject({
      onSetDates: false,
      rollover: true,
    });
    expect(kindOf(draft())).toBe("flex");
  });

  it("moves a week's start by as few days as it can", () => {
    expect(withWeekday("2026-10-09", 4)).toBe("2026-10-08");
    expect(withWeekday("2026-10-09", 1)).toBe("2026-10-12");
    expect(withWeekday(null, 0)).toBe("2023-12-31");
  });

  it("starts each period somewhere sensible and keeps the amount", () => {
    const weekly = draft({ periodAnchor: "2026-10-08" });
    expect(withPeriod(weekly, "fortnightly", [fortnightlyPay], "2026-10-11")).toMatchObject({
      period: "fortnightly",
      periodAnchor: "2026-10-09",
      amountCents: 20_000,
    });
    expect(withPeriod(weekly, "fortnightly", [], "2026-10-11")).toMatchObject({
      periodAnchor: "2026-10-08",
    });
    expect(withPeriod(draft(), "four_weekly", [], "2026-10-11")).toMatchObject({
      periodAnchor: "2026-10-05",
    });
    expect(withPeriod(weekly, "twice_monthly", [], "2026-10-11")).toMatchObject({
      periodAnchor: "2024-01-01",
      periodSecondDay: 16,
    });
    expect(halfDays({ anchor: "2024-01-01", secondDay: 16 })).toEqual([1, 16]);
    expect(withPeriod(weekly, "yearly", [], "2026-10-11")).toMatchObject({
      periodAnchor: "2024-07-01",
    });
    expect(withPeriod(draft({ rollover: true }), "custom", [], "2026-10-11")).toMatchObject({
      periodAnchor: "2026-10-11",
      periodEnd: "2026-10-24",
      rollover: false,
    });
    expect(withPeriod(weekly, "monthly", [], "2026-10-11")).toMatchObject({
      periodAnchor: null,
      periodSecondDay: null,
    });
  });

  it("starts new budgets the way the person's budgets run", () => {
    expect(startingPeriod("monthly", [fortnightlyPay]).period).toBe("monthly");
    expect(startingPeriod("weekly", [fortnightlyPay]).period).toBe("weekly");
    expect(startingPeriod("payday", [fortnightlyPay])).toMatchObject({
      period: "fortnightly",
      periodAnchor: "2026-10-09",
    });
    expect(startingPeriod("payday", [])).toMatchObject({ period: "monthly" });
    expect(
      startingPeriod("payday", [
        { frequency: "monthly", anchorDate: "2026-09-15", secondDay: null, amountCents: 1 },
      ]),
    ).toMatchObject({ period: "monthly", periodAnchor: "2024-01-15" });
  });

  it("makes a new budget at the usual month, as the board does", () => {
    const groceries = { id: "groceries", name: "Groceries", usual: 87_000 };
    expect(newBudget(groceries, "monthly", [])).toMatchObject({
      amountCents: 87_000,
      period: "monthly",
      onSetDates: false,
      alert80: true,
    });
    expect(newBudget({ ...groceries, usual: 86_667 }, "weekly", [])).toMatchObject({
      amountCents: 20_000,
      period: "weekly",
    });
    expect(newBudget({ id: "h", name: "Housing", usual: 225_000 }, "monthly", [])).toMatchObject({
      onSetDates: true,
      alert80: false,
      alert100: true,
    });
    expect(newBudget({ id: "g", name: "Gifts", usual: 0 }, "monthly", []).amountCents).toBe(10_000);
  });

  it("uses an average as the budget's own period, to the dollar", () => {
    expect(fromMonthly(87_000, spec("weekly"))).toBe(20_100);
    expect(fromMonthly(87_000, spec("monthly"))).toBe(87_000);
    expect(fromMonthly(10, spec("weekly"))).toBe(100);
  });

  it("counts pay as a month", () => {
    expect(payAsAMonth([fortnightlyPay])).toBe(706_333);
    expect(payAsAMonth([])).toBe(0);
  });
});
