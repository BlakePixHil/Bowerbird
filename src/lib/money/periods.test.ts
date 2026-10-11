import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import {
  convertAmount,
  dayOfPeriod,
  nextPeriod,
  periodContaining,
  previousPeriod,
  type Period,
  type PeriodSpec,
} from "./periods";

const spec = (
  period: PeriodSpec["period"],
  anchor: string | null = null,
  more: Partial<PeriodSpec> = {},
): PeriodSpec => ({ period, anchor, ...more });

const span = (start: string, end: string): Period => ({ start, end });

/** Twelve periods in a row from the one holding `date`, to check they meet with no gaps. */
function run(date: string, of: PeriodSpec): Period[] {
  const periods = [periodContaining(date, of)!];
  for (let i = 1; i < 12; i++) periods.push(nextPeriod(periods[i - 1], of)!);
  return periods;
}

function expectBackToBack(periods: Period[]) {
  for (let i = 1; i < periods.length; i++)
    expect(periods[i].start).toBe(addDays(periods[i - 1].end, 1));
  for (const period of periods) expect(period.start <= period.end).toBe(true);
}

describe("weekly", () => {
  it("runs Monday to Sunday unless it starts on another day", () => {
    expect(periodContaining("2026-10-11", spec("weekly"))).toEqual(
      span("2026-10-05", "2026-10-11"),
    );
    expect(periodContaining("2026-10-12", spec("weekly"))).toEqual(
      span("2026-10-12", "2026-10-18"),
    );
    // Starting on Thursdays, from any Thursday.
    expect(periodContaining("2026-10-11", spec("weekly", "2025-01-02"))).toEqual(
      span("2026-10-08", "2026-10-14"),
    );
  });

  it("crosses a year", () => {
    expect(periodContaining("2027-01-01", spec("weekly"))).toEqual(
      span("2026-12-28", "2027-01-03"),
    );
  });
});

describe("fortnightly", () => {
  const payday = spec("fortnightly", "2026-10-09");

  it("runs from a payday to the day before the next", () => {
    expect(periodContaining("2026-10-09", payday)).toEqual(span("2026-10-09", "2026-10-22"));
    expect(periodContaining("2026-10-08", payday)).toEqual(span("2026-09-25", "2026-10-08"));
  });

  it("crosses months, years and a leap day", () => {
    expect(periodContaining("2026-10-31", payday)).toEqual(span("2026-10-23", "2026-11-05"));
    expect(periodContaining("2026-12-31", payday)).toEqual(span("2026-12-18", "2026-12-31"));
    expect(periodContaining("2028-02-29", payday)).toEqual(span("2028-02-25", "2028-03-09"));
    expectBackToBack(run("2026-12-20", payday));
  });

  it("counts back from a payday in the future too", () => {
    expect(periodContaining("2026-01-01", spec("fortnightly", "2026-10-09"))).toEqual(
      span("2025-12-19", "2026-01-01"),
    );
  });
});

describe("four-weekly", () => {
  it("runs 28 days at a time from its start", () => {
    const of = spec("four_weekly", "2026-10-01");
    expect(periodContaining("2026-10-28", of)).toEqual(span("2026-10-01", "2026-10-28"));
    expect(periodContaining("2026-10-29", of)).toEqual(span("2026-10-29", "2026-11-25"));
    expect(run("2026-01-01", of).reduce((days, p) => days + dayOfPeriod(p.end, p).of, 0)).toBe(336);
  });
});

describe("monthly", () => {
  it("runs by calendar month", () => {
    expect(periodContaining("2026-10-11", spec("monthly"))).toEqual(
      span("2026-10-01", "2026-10-31"),
    );
    expect(periodContaining("2028-02-10", spec("monthly"))).toEqual(
      span("2028-02-01", "2028-02-29"),
    );
    expect(periodContaining("2027-02-10", spec("monthly"))).toEqual(
      span("2027-02-01", "2027-02-28"),
    );
  });

  it("runs from a set day", () => {
    const fifteenth = spec("monthly", "2026-01-15");
    expect(periodContaining("2026-10-11", fifteenth)).toEqual(span("2026-09-15", "2026-10-14"));
    expect(periodContaining("2026-10-15", fifteenth)).toEqual(span("2026-10-15", "2026-11-14"));
    expect(periodContaining("2026-12-20", fifteenth)).toEqual(span("2026-12-15", "2027-01-14"));
  });

  it("starts on a shorter month's last day for days 29 to 31", () => {
    const lastDay = spec("monthly", "2026-01-31");
    expect(run("2026-01-31", lastDay).slice(0, 4)).toEqual([
      span("2026-01-31", "2026-02-27"),
      span("2026-02-28", "2026-03-30"),
      span("2026-03-31", "2026-04-29"),
      span("2026-04-30", "2026-05-30"),
    ]);
    expectBackToBack(run("2026-01-31", lastDay));
    const the29th = spec("monthly", "2026-01-29");
    expect(periodContaining("2028-02-29", the29th)).toEqual(span("2028-02-29", "2028-03-28"));
    expect(periodContaining("2027-03-01", the29th)).toEqual(span("2027-02-28", "2027-03-28"));
  });
});

describe("twice a month", () => {
  it("runs from each of its two days to the day before the other", () => {
    const of = spec("twice_monthly", "2026-01-01", { secondDay: 15 });
    expect(periodContaining("2026-10-11", of)).toEqual(span("2026-10-01", "2026-10-14"));
    expect(periodContaining("2026-10-15", of)).toEqual(span("2026-10-15", "2026-10-31"));
    expect(periodContaining("2026-10-11", spec("twice_monthly"))).toEqual(
      span("2026-10-01", "2026-10-14"),
    );
  });

  it("takes the days in either order, and the last day of the month", () => {
    const of = spec("twice_monthly", "2026-01-31", { secondDay: 15 });
    expect(periodContaining("2026-02-20", of)).toEqual(span("2026-02-15", "2026-02-27"));
    expect(periodContaining("2026-02-28", of)).toEqual(span("2026-02-28", "2026-03-14"));
    expect(periodContaining("2026-01-05", of)).toEqual(span("2025-12-31", "2026-01-14"));
    expectBackToBack(run("2025-12-31", of));
  });

  it("is monthly when both days are the same", () => {
    const of = spec("twice_monthly", "2026-01-10", { secondDay: 10 });
    expect(periodContaining("2026-10-11", of)).toEqual(span("2026-10-10", "2026-11-09"));
  });
});

describe("quarterly and yearly", () => {
  it("runs by calendar quarter", () => {
    expect(periodContaining("2026-10-11", spec("quarterly"))).toEqual(
      span("2026-10-01", "2026-12-31"),
    );
    expect(periodContaining("2028-03-31", spec("quarterly"))).toEqual(
      span("2028-01-01", "2028-03-31"),
    );
    expect(periodContaining("2026-05-01", spec("quarterly"))).toEqual(
      span("2026-04-01", "2026-06-30"),
    );
  });

  it("runs by calendar year", () => {
    expect(periodContaining("2026-10-11", spec("yearly"))).toEqual(
      span("2026-01-01", "2026-12-31"),
    );
  });

  it("runs by financial year, July to June, either side of its boundary", () => {
    const financial = spec("yearly", "2020-07-01");
    expect(periodContaining("2026-06-30", financial)).toEqual(span("2025-07-01", "2026-06-30"));
    expect(periodContaining("2026-07-01", financial)).toEqual(span("2026-07-01", "2027-06-30"));
    expect(dayOfPeriod("2028-06-30", periodContaining("2028-06-30", financial)!)).toEqual({
      day: 366,
      of: 366,
    });
  });
});

describe("custom", () => {
  const trip = spec("custom", "2027-04-02", { end: "2027-04-15" });

  it("covers only its own dates, and doesn't repeat", () => {
    expect(periodContaining("2027-04-10", trip)).toEqual(span("2027-04-02", "2027-04-15"));
    expect(periodContaining("2027-04-16", trip)).toBeNull();
    expect(periodContaining("2027-04-01", trip)).toBeNull();
    expect(nextPeriod(span("2027-04-02", "2027-04-15"), trip)).toBeNull();
    expect(previousPeriod(span("2027-04-02", "2027-04-15"), trip)).toBeNull();
  });

  it("is nothing without its dates", () => {
    expect(periodContaining("2027-04-10", spec("custom", "2027-04-02"))).toBeNull();
    expect(
      periodContaining("2027-04-10", spec("custom", "2027-04-15", { end: "2027-04-02" })),
    ).toBeNull();
  });
});

describe("moving between periods", () => {
  it("goes back and forward", () => {
    const month = periodContaining("2026-03-10", spec("monthly"))!;
    expect(previousPeriod(month, spec("monthly"))).toEqual(span("2026-02-01", "2026-02-28"));
    expect(nextPeriod(month, spec("monthly"))).toEqual(span("2026-04-01", "2026-04-30"));
    const fortnight = periodContaining("2026-10-11", spec("fortnightly", "2026-10-09"))!;
    expect(
      previousPeriod(
        nextPeriod(fortnight, spec("fortnightly", "2026-10-09"))!,
        spec("fortnightly", "2026-10-09"),
      ),
    ).toEqual(fortnight);
  });

  it("says which day of the period it is", () => {
    const october = periodContaining("2026-10-10", spec("monthly"))!;
    expect(dayOfPeriod("2026-10-10", october)).toEqual({ day: 10, of: 31 });
    expect(dayOfPeriod("2026-10-01", october)).toEqual({ day: 1, of: 31 });
    const leapFebruary = periodContaining("2028-02-29", spec("monthly"))!;
    expect(dayOfPeriod("2028-02-29", leapFebruary)).toEqual({ day: 29, of: 29 });
  });
});

describe("convertAmount", () => {
  const weekly = spec("weekly");
  const monthly = spec("monthly");

  it("goes through a year: weekly × 52 ÷ 12 for a month", () => {
    expect(convertAmount(10_000, weekly, monthly)).toBe(43_333);
    expect(convertAmount(43_333, monthly, weekly)).toBe(10_000);
    expect(convertAmount(120_000, monthly, spec("yearly"))).toBe(1_440_000);
    expect(convertAmount(1_440_000, spec("yearly"), spec("quarterly"))).toBe(360_000);
    expect(convertAmount(10_000, spec("fortnightly", "2026-10-09"), monthly)).toBe(21_667);
    expect(convertAmount(10_000, spec("twice_monthly"), monthly)).toBe(20_000);
    expect(convertAmount(10_000, spec("four_weekly", "2026-10-01"), monthly)).toBe(10_833);
  });

  it("rounds once, to the nearest cent, halves away from zero", () => {
    // $1 a fortnight is 50 cents a week exactly; 1 cent a fortnight is half a cent a week.
    expect(convertAmount(100, spec("fortnightly", "2026-10-09"), weekly)).toBe(50);
    expect(convertAmount(1, spec("fortnightly", "2026-10-09"), weekly)).toBe(1);
    expect(convertAmount(-1, spec("fortnightly", "2026-10-09"), weekly)).toBe(-1);
    expect(convertAmount(-10_000, weekly, monthly)).toBe(-43_333);
    expect(convertAmount(0, weekly, monthly)).toBe(0);
  });

  it("counts a custom period as 365 days a year over its length", () => {
    const tenDays = spec("custom", "2027-04-01", { end: "2027-04-10" });
    expect(convertAmount(10_000, tenDays, spec("yearly"))).toBe(365_000);
    expect(convertAmount(365_000, spec("yearly"), tenDays)).toBe(10_000);
    expect(() => convertAmount(100, spec("custom"), weekly)).toThrow(RangeError);
  });

  it("keeps a household's budgets adding up across periods", () => {
    // Groceries $200 a week, rent $2,250 a month, car $1,200 a year: one month of each.
    const month = [
      convertAmount(20_000, weekly, monthly),
      convertAmount(225_000, monthly, monthly),
      convertAmount(120_000, spec("yearly"), monthly),
    ];
    expect(month).toEqual([86_667, 225_000, 10_000]);
  });

  it("refuses money that isn't whole cents", () => {
    expect(() => convertAmount(10.5, weekly, monthly)).toThrow(RangeError);
  });
});
