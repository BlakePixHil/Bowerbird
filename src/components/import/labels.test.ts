import { describe, expect, it } from "vitest";
import { dateRange, fileSize, listWords, shortRange, shownSample } from "./labels";

describe("import labels", () => {
  it("masks account and card numbers in a column's sample", () => {
    expect(shownSample("000-000 000000")).toBe("•••• ••••");
    expect(shownSample("4111 1111 1111 1111")).toBe("•••• ••••");
    expect(shownSample("1,904.35")).toBe("1,904.35");
    expect(shownSample("03/09/2026")).toBe("03/09/2026");
    expect(shownSample("12345")).toBe("12345");
    expect(shownSample("  ")).toBe("(blank)");
  });

  it("writes date ranges for the page and for tight spaces", () => {
    expect(dateRange("2026-09-01", "2026-09-03")).toBe("Tue 1 Sep to Thu 3 Sep 2026");
    expect(dateRange("2026-09-01", "2026-09-01")).toBe("Tue 1 Sep 2026");
    expect(dateRange("2025-12-30", "2026-01-02")).toBe("Tue 30 Dec 2025 to Fri 2 Jan 2026");
    expect(shortRange("2026-09-01", "2026-09-30")).toBe("1 Sep to 30 Sep");
    expect(shortRange("2025-12-30", "2026-01-02")).toBe("30 Dec 2025 to 2 Jan 2026");
    expect(shortRange("2026-09-01", "2026-09-01")).toBe("1 Sep");
    expect(shortRange(null, null)).toBeNull();
  });

  it("writes sizes and lists in plain words", () => {
    expect(fileSize(300)).toBe("1 KB");
    expect(fileSize(18_400)).toBe("18 KB");
    expect(fileSize(1.2 * 1024 * 1024)).toBe("1.2 MB");
    expect(fileSize(4 * 1024 * 1024)).toBe("4 MB");
    expect(listWords(["a"])).toBe("a");
    expect(listWords(["a", "b", "c"])).toBe("a, b and c");
  });
});
