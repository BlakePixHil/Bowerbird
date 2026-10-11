import { describe, expect, it } from "vitest";
import type { PaySchedule } from "@/lib/money";
import { cycleWords, dayWords, payHeadline, seenWords, withFrequency, withPayday } from "./paydays";

const every = (
  frequency: PaySchedule["frequency"],
  anchorDate: string,
  secondDay: number | null = null,
): PaySchedule => ({ frequency, anchorDate, secondDay });

describe("words", () => {
  it("says the day of the month", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30, 31].map(dayWords)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "30th",
      "last day",
    ]);
  });

  it("says how often pay comes", () => {
    expect(cycleWords(every("weekly", "2026-10-09"))).toBe("every Friday");
    expect(cycleWords(every("fortnightly", "2026-10-09"))).toBe("every second Friday");
    expect(cycleWords(every("four_weekly", "2026-10-05"))).toBe("every fourth Monday");
    expect(cycleWords(every("monthly", "2026-10-15"))).toBe("on the 15th of each month");
    expect(cycleWords(every("monthly", "2026-08-31"))).toBe("on the last day of each month");
    expect(cycleWords(every("twice_monthly", "2026-10-31", 15))).toBe(
      "on the 15th and last day of each month",
    );
  });

  it("puts the amount, account and cycle together, as the board does", () => {
    expect(
      payHeadline({
        amountCents: 326_000,
        accountName: "Everyday",
        schedule: every("fortnightly", "2026-10-09"),
      }),
    ).toBe("$3,260 into Everyday every second Friday");
    expect(
      payHeadline({
        amountCents: 24_050,
        accountName: null,
        schedule: every("weekly", "2026-10-10"),
      }),
    ).toBe("$240.50 every Saturday");
  });

  it("says what was seen", () => {
    const seen = ["2026-07-17", "2026-07-31", "2026-08-14"];
    expect(seenWords(seen, 326_000, 326_000)).toBe(
      "Seen 3 times since Fri 17 Jul, $3,260 each time.",
    );
    expect(seenWords(seen, 300_000, 320_000)).toBe(
      "Seen 3 times since Fri 17 Jul, $3,000 to $3,200.",
    );
  });
});

describe("changing the cycle", () => {
  it("counts a new frequency from the last payday", () => {
    const fortnightly = every("fortnightly", "2026-10-09");
    expect(withFrequency(fortnightly, "weekly", "2026-10-09")).toEqual(
      every("weekly", "2026-10-09"),
    );
    expect(withFrequency(fortnightly, "monthly", "2026-10-09")).toEqual(
      every("monthly", "2026-10-09"),
    );
    expect(withFrequency(fortnightly, "fortnightly", "2026-01-01")).toBe(fortnightly);
  });

  it("starts twice-monthly pay on the 15th and the last day", () => {
    expect(withFrequency(every("monthly", "2026-10-09"), "twice_monthly", "2026-10-09")).toEqual(
      every("twice_monthly", "2026-10-15", 31),
    );
  });

  it("moves the payday someone picks, and the nearer twice-monthly day", () => {
    expect(withPayday(every("fortnightly", "2026-10-09"), "2026-10-16")).toEqual(
      every("fortnightly", "2026-10-16"),
    );
    const twice = every("twice_monthly", "2026-10-15", 31);
    expect(withPayday(twice, "2026-10-14")).toEqual(every("twice_monthly", "2026-10-14", 31));
    expect(withPayday(twice, "2026-10-28")).toEqual(every("twice_monthly", "2026-10-28", 15));
    expect(withPayday(every("twice_monthly", "", null), "2026-10-01")).toEqual(
      every("twice_monthly", "2026-10-01", 31),
    );
  });
});
