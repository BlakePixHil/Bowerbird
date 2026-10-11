import { describe, expect, it } from "vitest";
import {
  billDays,
  carried,
  daysFor,
  elapsed,
  expectedEvenly,
  overlap,
  paceOf,
  plannedFor,
  spentIn,
} from "./pace";
import type { Period, PeriodSpec } from "./periods";

const span = (start: string, end: string): Period => ({ start, end });
const october = span("2026-10-01", "2026-10-31");
const september = span("2026-09-01", "2026-09-30");
const month: PeriodSpec = { period: "monthly", anchor: null };

describe("what falls in a period", () => {
  it("adds up spending on the period's days only", () => {
    const days = [
      { date: "2026-09-30", cents: 1_000 },
      { date: "2026-10-01", cents: 2_000 },
      { date: "2026-10-31", cents: 300 },
      { date: "2026-11-01", cents: 40 },
    ];
    expect(spentIn(days, october)).toBe(2_300);
    expect(spentIn([], october)).toBe(0);
  });

  it("converts a repeating budget and shares out a one-off", () => {
    expect(plannedFor(20_000, { period: "weekly", anchor: null }, month, october)).toBe(86_667);
    expect(plannedFor(225_000, month, month, october)).toBe(225_000);
    const trip: PeriodSpec = { period: "custom", anchor: "2026-10-25", end: "2026-11-07" };
    // 7 of its 14 days are in October.
    expect(plannedFor(140_000, trip, month, october)).toBe(70_000);
    expect(daysFor(trip, october)).toEqual(span("2026-10-25", "2026-10-31"));
    expect(plannedFor(140_000, trip, month, september)).toBe(0);
    expect(daysFor(trip, september)).toBeNull();
    expect(overlap(september, october)).toBeNull();
  });
});

describe("expected by today", () => {
  it("builds everyday spending up evenly, counting today", () => {
    expect(elapsed(october, "2026-10-10")).toBeCloseTo(10 / 31);
    expect(expectedEvenly(310_000, october, "2026-10-10")).toBe(100_000);
    expect(expectedEvenly(310_000, october, "2026-09-30")).toBe(0);
    expect(expectedEvenly(310_000, october, "2026-11-04")).toBe(310_000);
  });
});

describe("bills on set dates", () => {
  const rent = [{ date: "2026-09-01", cents: 225_000 }];

  it("repeats the days they went out last period", () => {
    expect(billDays(225_000, month, october, rent)).toEqual({
      days: [{ date: "2026-10-01", cents: 225_000 }],
      next: "2026-11-01",
    });
    // Two bills last month share a bigger plan the way they shared last month's spending.
    const two = [...rent, { date: "2026-09-14", cents: 18_640 }];
    expect(billDays(250_000, month, october, two)?.days).toEqual([
      { date: "2026-10-01", cents: 230_873 },
      { date: "2026-10-14", cents: 19_127 },
    ]);
  });

  it("puts a month's rent in the fortnight with the 1st, and none in the next", () => {
    // This fortnight starts in September, so it goes by August.
    const fortnight = span("2026-09-25", "2026-10-08");
    const both = [{ date: "2026-08-01", cents: 225_000 }, ...rent];
    expect(billDays(225_000, month, fortnight, both)).toEqual({
      days: [{ date: "2026-10-01", cents: 225_000 }],
      next: "2026-11-01",
    });
    expect(billDays(225_000, month, span("2026-10-09", "2026-10-22"), rent)).toEqual({
      days: [],
      next: "2026-11-01",
    });
  });

  it("counts a weekly bill each week of the month", () => {
    const weekly: PeriodSpec = { period: "weekly", anchor: null };
    // The week before Mon 28 Sep had it on the Friday.
    const result = billDays(2_500, weekly, october, [{ date: "2026-09-25", cents: 2_000 }]);
    expect(result?.days.map((day) => day.date)).toEqual([
      "2026-10-02",
      "2026-10-09",
      "2026-10-16",
      "2026-10-23",
      "2026-10-30",
    ]);
    expect(result?.days.every((day) => day.cents === 2_500)).toBe(true);
    expect(result?.next).toBe("2026-11-06");
  });

  it("keeps a day past the month's end on its last day", () => {
    const february = span("2027-02-01", "2027-02-28");
    expect(billDays(1_000, month, february, [{ date: "2027-01-31", cents: 900 }])).toEqual({
      days: [{ date: "2027-02-28", cents: 1_000 }],
      next: "2027-03-31",
    });
  });

  it("has nothing to go by without spending last period", () => {
    expect(billDays(225_000, month, october, [])).toBeNull();
    expect(billDays(225_000, month, october, [{ date: "2026-08-01", cents: 225_000 }])).toBeNull();
  });
});

describe("pace", () => {
  it("allows 3% either side before it's ahead or behind", () => {
    expect(paceOf(21_400, 29_032, 90_000)).toEqual({ kind: "behind", cents: 7_632 });
    expect(paceOf(29_000, 29_032, 90_000)).toEqual({ kind: "on", cents: 0 });
    expect(paceOf(13_100, 12_903, 40_000)).toEqual({ kind: "on", cents: 0 });
    expect(paceOf(11_000, 6_452, 20_000)).toEqual({ kind: "ahead", cents: 4_548 });
    expect(paceOf(22_600, 6_452, 20_000)).toEqual({ kind: "over", cents: 2_600 });
    expect(paceOf(500, 0, 0)).toEqual({ kind: "over", cents: 500 });
    expect(paceOf(0, 0, 0)).toEqual({ kind: "on", cents: 0 });
  });
});

describe("rollover", () => {
  it("carries what's left, and overspending uses it up first", () => {
    const health = (spent: number) => ({ planned: 15_000, spent });
    expect(carried([])).toBe(0);
    expect(carried([health(11_000)])).toBe(4_000);
    expect(carried([health(11_000), health(0)])).toBe(19_000);
    // $40 left, then $50 over: the $40 goes and the extra $10 isn't owed.
    expect(carried([health(11_000), health(20_000)])).toBe(0);
    expect(carried([health(11_000), health(20_000), health(10_000)])).toBe(5_000);
  });
});
