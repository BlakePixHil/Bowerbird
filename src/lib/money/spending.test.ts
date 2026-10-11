import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { againstUsual, spentBy, weekSpending, type DaySpend } from "./spending";

const TODAY = "2026-10-10";

/** `perDay` cents every day from `since` to today. */
const steady = (since: string, perDay: number): DaySpend[] => {
  const days: DaySpend[] = [];
  for (let date = since; date <= TODAY; date = addDays(date, 1)) days.push({ date, cents: perDay });
  return days;
};

describe("spentBy", () => {
  it("counts money out that isn't a transfer", () => {
    expect(spentBy({ amountCents: -86_20, notCounted: false })).toBe(86_20);
    expect(spentBy({ amountCents: -2200_00, notCounted: true })).toBe(0);
    expect(spentBy({ amountCents: 3260_00, notCounted: false })).toBe(0);
  });
});

describe("weekSpending", () => {
  it("adds up this week and last week, and fills the fortnight with every day", () => {
    const result = weekSpending(
      [
        { date: TODAY, cents: 112_40 },
        { date: addDays(TODAY, -6), cents: 10_00 },
        { date: addDays(TODAY, -7), cents: 99_00 },
        { date: addDays(TODAY, -13), cents: 1_00 },
        { date: addDays(TODAY, -14), cents: 500_00 },
      ],
      TODAY,
      "2026-01-01",
    );
    expect(result.week).toBe(122_40);
    expect(result.lastWeek).toBe(100_00);
    expect(result.fortnight).toHaveLength(14);
    expect(result.fortnight[0]).toEqual({ date: addDays(TODAY, -13), cents: 1_00 });
    expect(result.fortnight[13]).toEqual({ date: TODAY, cents: 112_40 });
    expect(result.fortnight[5].cents).toBe(0);
  });

  it("takes the middle of the last twelve weeks as a usual week", () => {
    const days = steady(addDays(TODAY, -200), 70_00);
    // One big week away doesn't move the usual week.
    days.push({ date: addDays(TODAY, -20), cents: 2000_00 });
    const result = weekSpending(days, TODAY, addDays(TODAY, -200));
    expect(result.usualWeek).toBe(490_00);
    expect(result.usualDay).toBe(70_00);
  });

  it("only counts weeks with history, and needs two of them", () => {
    const since = addDays(TODAY, -20);
    const days = steady(since, 10_00);
    // Today's week plus two full weeks before it (days -7..-13 and -14..-20).
    expect(weekSpending(days, TODAY, since).usualWeek).toBe(70_00);
    expect(weekSpending(days, TODAY, addDays(TODAY, -19)).usualWeek).toBeNull();
    expect(weekSpending([], TODAY, null)).toMatchObject({
      week: 0,
      usualWeek: null,
      usualDay: null,
    });
  });

  it("rounds a usual day to the cent", () => {
    const since = addDays(TODAY, -27);
    const result = weekSpending([{ date: addDays(TODAY, -10), cents: 100_00 }], TODAY, since);
    // Weeks before this one: $100, $0, $0. The middle is $0.
    expect(result.usualWeek).toBe(0);
    const two = weekSpending(
      [
        { date: addDays(TODAY, -10), cents: 100_00 },
        { date: addDays(TODAY, -17), cents: 33_33 },
      ],
      TODAY,
      addDays(TODAY, -20),
    );
    expect(two.usualWeek).toBe(66_67);
    expect(two.usualDay).toBe(9_52);
  });
});

describe("againstUsual", () => {
  it("says more or less in whole dollars, and about usual when it's close", () => {
    expect(againstUsual(560_00, 486_00)).toEqual({ kind: "more", cents: 74_00 });
    expect(againstUsual(400_00, 486_00)).toEqual({ kind: "less", cents: 86_00 });
    expect(againstUsual(500_00, 486_00)).toEqual({ kind: "about", cents: 0 });
    expect(againstUsual(54_00, 50_00)).toEqual({ kind: "about", cents: 0 });
    expect(againstUsual(0, 0)).toEqual({ kind: "about", cents: 0 });
  });
});
