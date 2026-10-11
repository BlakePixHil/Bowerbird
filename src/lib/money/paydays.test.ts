import { describe, expect, it } from "vitest";
import {
  mainIncome,
  nextPayday,
  paydayAfter,
  paydayOnOrBefore,
  paydaysBetween,
  payPeriods,
  yearlyCents,
  type PayCycle,
  type PaySchedule,
} from "./paydays";

const every = (
  frequency: PaySchedule["frequency"],
  anchorDate: string,
  secondDay: number | null = null,
): PaySchedule => ({ frequency, anchorDate, secondDay });

describe("paydaysBetween", () => {
  it("counts weekly, fortnightly and four-weekly pay in steps from a known payday", () => {
    expect(paydaysBetween(every("weekly", "2026-10-09"), "2026-09-28", "2026-10-20")).toEqual([
      "2026-10-02",
      "2026-10-09",
      "2026-10-16",
    ]);
    expect(paydaysBetween(every("fortnightly", "2026-10-09"), "2026-08-20", "2026-10-31")).toEqual([
      "2026-08-28",
      "2026-09-11",
      "2026-09-25",
      "2026-10-09",
      "2026-10-23",
    ]);
    expect(paydaysBetween(every("four_weekly", "2026-10-09"), "2026-07-01", "2026-12-31")).toEqual([
      "2026-07-17",
      "2026-08-14",
      "2026-09-11",
      "2026-10-09",
      "2026-11-06",
      "2026-12-04",
    ]);
  });

  it("includes both ends", () => {
    expect(paydaysBetween(every("weekly", "2026-10-09"), "2026-10-09", "2026-10-16")).toEqual([
      "2026-10-09",
      "2026-10-16",
    ]);
    expect(paydaysBetween(every("weekly", "2026-10-09"), "2026-10-10", "2026-10-09")).toEqual([]);
  });

  it("keeps fortnights going across months and years", () => {
    expect(paydaysBetween(every("fortnightly", "2026-12-18"), "2026-12-01", "2027-01-31")).toEqual([
      "2026-12-04",
      "2026-12-18",
      "2027-01-01",
      "2027-01-15",
      "2027-01-29",
    ]);
  });

  it("puts monthly pay on the same day each month", () => {
    expect(paydaysBetween(every("monthly", "2026-09-15"), "2026-08-01", "2026-11-30")).toEqual([
      "2026-08-15",
      "2026-09-15",
      "2026-10-15",
      "2026-11-15",
    ]);
  });

  it("moves a day past a month's end to its last day", () => {
    expect(paydaysBetween(every("monthly", "2026-08-31"), "2026-01-01", "2026-05-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
    expect(paydaysBetween(every("monthly", "2028-01-30"), "2028-02-01", "2028-03-31")).toEqual([
      "2028-02-29",
      "2028-03-30",
    ]);
  });

  it("puts twice-monthly pay on both days, in order", () => {
    expect(
      paydaysBetween(every("twice_monthly", "2026-10-15", 31), "2026-09-01", "2026-10-31"),
    ).toEqual(["2026-09-15", "2026-09-30", "2026-10-15", "2026-10-31"]);
    expect(
      paydaysBetween(every("twice_monthly", "2026-10-28", 14), "2026-10-01", "2026-11-30"),
    ).toEqual(["2026-10-14", "2026-10-28", "2026-11-14", "2026-11-28"]);
  });

  it("pays once when both twice-monthly days fall on February's last day", () => {
    expect(
      paydaysBetween(every("twice_monthly", "2026-01-30", 31), "2026-02-01", "2026-02-28"),
    ).toEqual(["2026-02-28"]);
  });
});

describe("the paydays around a day", () => {
  it("finds the next payday after a day, never the day itself", () => {
    const fortnightly = every("fortnightly", "2026-10-09");
    expect(paydayAfter(fortnightly, "2026-10-08")).toBe("2026-10-09");
    expect(paydayAfter(fortnightly, "2026-10-09")).toBe("2026-10-23");
    expect(paydayAfter(fortnightly, "2025-01-01")).toBe("2025-01-03");
    expect(paydayAfter(every("monthly", "2026-01-31"), "2026-01-31")).toBe("2026-02-28");
    expect(paydayAfter(every("twice_monthly", "2026-10-15", 31), "2026-10-15")).toBe("2026-10-31");
    expect(paydayAfter(every("twice_monthly", "2026-10-15", 31), "2026-12-31")).toBe("2027-01-15");
  });

  it("finds the last payday on or before a day", () => {
    const weekly = every("weekly", "2026-10-09");
    expect(paydayOnOrBefore(weekly, "2026-10-09")).toBe("2026-10-09");
    expect(paydayOnOrBefore(weekly, "2026-10-08")).toBe("2026-10-02");
    expect(paydayOnOrBefore(every("monthly", "2026-08-31"), "2026-03-15")).toBe("2026-02-28");
    expect(paydayOnOrBefore(every("twice_monthly", "2026-10-15", 31), "2026-11-03")).toBe(
      "2026-10-31",
    );
  });
});

const income = (schedule: PaySchedule, amountCents: number): PayCycle => ({
  ...schedule,
  amountCents,
});

describe("a person's pay cycle", () => {
  const salary = income(every("fortnightly", "2026-10-09"), 326_000);
  const sideJob = income(every("weekly", "2026-10-06"), 30_000);

  it("adds up a year of each frequency", () => {
    expect(yearlyCents(salary)).toBe(8_476_000);
    expect(yearlyCents({ amountCents: 100, frequency: "weekly" })).toBe(5_200);
    expect(yearlyCents({ amountCents: 100, frequency: "twice_monthly" })).toBe(2_400);
    expect(yearlyCents({ amountCents: 100, frequency: "four_weekly" })).toBe(1_300);
    expect(yearlyCents({ amountCents: 100, frequency: "monthly" })).toBe(1_200);
  });

  it("follows the income that brings in the most", () => {
    expect(mainIncome([sideJob, salary])).toBe(salary);
    expect(mainIncome([])).toBeNull();
    // $600 a fortnight and $1,300 a month are both $15,600 a year.
    const fortnightly = income(every("fortnightly", "2026-10-09"), 60_000);
    const monthly = income(every("monthly", "2026-10-15"), 130_000);
    expect(mainIncome([fortnightly, monthly])).toBe(fortnightly);
    expect(mainIncome([monthly, fortnightly])).toBe(monthly);
  });

  it("gives the next payday, or none without an income", () => {
    expect(nextPayday([sideJob, salary], "2026-10-11")).toBe("2026-10-23");
    expect(nextPayday([], "2026-10-11")).toBeNull();
  });

  it("splits time into pay periods that start on paydays", () => {
    expect(payPeriods([salary], "2026-10-01", "2026-10-31")).toEqual([
      { start: "2026-09-25", end: "2026-10-08" },
      { start: "2026-10-09", end: "2026-10-22" },
      { start: "2026-10-23", end: "2026-11-05" },
    ]);
    expect(payPeriods([salary], "2026-10-09", "2026-10-09")).toEqual([
      { start: "2026-10-09", end: "2026-10-22" },
    ]);
    expect(payPeriods([], "2026-10-01", "2026-10-31")).toEqual([]);
  });

  it("runs month-end and twice-monthly periods to the day before the next payday", () => {
    const monthEnd = income(every("monthly", "2026-08-31"), 600_000);
    expect(payPeriods([monthEnd], "2026-02-01", "2026-03-31")).toEqual([
      { start: "2026-01-31", end: "2026-02-27" },
      { start: "2026-02-28", end: "2026-03-30" },
      { start: "2026-03-31", end: "2026-04-29" },
    ]);
    const twice = income(every("twice_monthly", "2026-10-15", 31), 300_000);
    expect(payPeriods([twice], "2026-10-01", "2026-10-31")).toEqual([
      { start: "2026-09-30", end: "2026-10-14" },
      { start: "2026-10-15", end: "2026-10-30" },
      { start: "2026-10-31", end: "2026-11-14" },
    ]);
  });
});
