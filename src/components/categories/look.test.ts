import { describe, expect, it } from "vitest";
import { colourNote, metaLine, monthName, rulesSummary, shareText, tabOf } from "./look";

describe("categories page words", () => {
  it("picks the tab from the address, falling back to Categories", () => {
    expect(tabOf("rules")).toBe("rules");
    expect(tabOf("shops")).toBe("shops");
    expect(tabOf("nonsense")).toBe("categories");
    expect(tabOf(null)).toBe("categories");
  });

  it("names the month", () => {
    expect(monthName("2026-10-11")).toBe("October");
    expect(monthName("2026-01-31")).toBe("January");
  });

  it("gives a share of spending in words", () => {
    expect(shareText(4_200, 10_000)).toBe("42%");
    expect(shareText(50, 10_000)).toBe("under 1%");
    expect(shareText(0, 10_000)).toBe("");
    expect(shareText(500, 0)).toBe("");
  });

  it("says what's in a category, or what it usually holds", () => {
    expect(metaLine({ count: 4, rules: 2, usual: 0 })).toBe("4 transactions · 2 rules");
    expect(metaLine({ count: 1, rules: 1, usual: 0 })).toBe("1 transaction · 1 rule");
    expect(metaLine({ count: 0, rules: 0, usual: 87_000 })).toBe("Nothing yet, usually $870");
    expect(metaLine({ count: 0, rules: 0, usual: 0 })).toBe("Nothing yet");
  });

  it("sums up the rules", () => {
    expect(rulesSummary([])).toBe("No rules yet.");
    expect(rulesSummary([{ enabled: false, sorted: 3 }])).toBe(
      "Your rule is off. It's sorted 3 transactions for you.",
    );
    expect(
      rulesSummary([
        { enabled: true, sorted: 1_000 },
        { enabled: true, sorted: 28 },
      ]),
    ).toBe("All 2 rules are on. They've sorted 1,028 transactions for you.");
    expect(
      rulesSummary([
        { enabled: true, sorted: 1 },
        { enabled: false, sorted: 0 },
      ]),
    ).toBe("1 of 2 rules are on. They've sorted 1 transaction for you.");
  });

  it("explains a category's colour", () => {
    expect(colourNote({ name: "Income", kind: "income", colourSlot: null })).toMatch(/green/);
    expect(colourNote({ name: "Groceries", kind: "spending", colourSlot: 3 })).toMatch(
      /Groceries always looks the same/,
    );
    expect(colourNote({ name: "Pets", kind: "spending", colourSlot: null })).toMatch(
      /Pets shares grey/,
    );
  });
});
