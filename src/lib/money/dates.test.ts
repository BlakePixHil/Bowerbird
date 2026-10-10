import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  clampedDate,
  dayOfWeek,
  daysBetween,
  formatShortDate,
  isPlainDate,
  todayIn,
} from "./dates";

describe("plain dates", () => {
  it("validates dates", () => {
    expect(isPlainDate("2026-10-10")).toBe(true);
    expect(isPlainDate("2028-02-29")).toBe(true);
    expect(isPlainDate("2026-02-29")).toBe(false);
    expect(isPlainDate("2026-13-01")).toBe(false);
    expect(isPlainDate("10/10/2026")).toBe(false);
  });

  it("works out today in the household's time zone", () => {
    // 2026-10-10 14:30 UTC is already 11 Oct in Sydney (UTC+11 in daylight saving).
    const now = new Date("2026-10-10T14:30:00Z");
    expect(todayIn("Australia/Sydney", now)).toBe("2026-10-11");
    expect(todayIn("UTC", now)).toBe("2026-10-10");
  });

  it("adds days across months, years and daylight saving changes", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-04", 1)).toBe("2026-10-05"); // Sydney's clocks went forward on 4 Oct
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-10-01", "2026-10-15")).toBe(14);
    expect(daysBetween("2026-10-15", "2026-10-01")).toBe(-14);
    expect(daysBetween("2027-07-01", "2028-07-01")).toBe(366);
  });

  it("knows the day of the week", () => {
    expect(dayOfWeek("2026-10-10")).toBe(6); // Saturday
    expect(dayOfWeek("2026-10-11")).toBe(0); // Sunday
  });

  it("clamps days to the end of the month", () => {
    expect(clampedDate(2026, 2, 31)).toBe("2026-02-28");
    expect(clampedDate(2028, 2, 30)).toBe("2028-02-29");
    expect(clampedDate(2026, 4, 31)).toBe("2026-04-30");
  });

  it("adds months, keeping the day where it can", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-03-15", -3)).toBe("2025-12-15");
    expect(addMonths("2026-02-28", 1, 31)).toBe("2026-03-31");
  });

  it("formats the on-screen date style", () => {
    expect(formatShortDate("2026-10-10")).toBe("Sat 10 Oct");
    expect(formatShortDate("2026-07-17", { year: true })).toBe("Fri 17 Jul 2026");
  });
});
