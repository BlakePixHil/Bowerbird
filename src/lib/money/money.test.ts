import { describe, expect, it } from "vitest";
import {
  allocateCents,
  formatCost,
  formatMoney,
  formatPercent,
  MINUS,
  parseMoney,
  percentChange,
  ratio,
  sumCents,
} from "./index";

describe("formatMoney", () => {
  it("formats positive amounts with thousands separators", () => {
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(100)).toBe("$1.00");
    expect(formatMoney(5)).toBe("$0.05");
  });

  it("uses a real minus sign for money out", () => {
    expect(formatMoney(-8620)).toBe(`${MINUS}$86.20`);
    expect(formatMoney(-8620)).toBe("−$86.20");
  });

  it("formats zero without a sign", () => {
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(0, { sign: "always" })).toBe("$0.00");
    expect(formatMoney(-0)).toBe("$0.00");
  });

  it("handles large values", () => {
    expect(formatMoney(123_456_789_012)).toBe("$1,234,567,890.12");
    expect(formatMoney(-Number.MAX_SAFE_INTEGER)).toBe(`${MINUS}$90,071,992,547,409.91`);
  });

  it("rounds to whole dollars half away from zero", () => {
    expect(formatMoney(123456, { decimals: "never" })).toBe("$1,235");
    expect(formatMoney(123449, { decimals: "never" })).toBe("$1,234");
    expect(formatMoney(-50, { decimals: "never" })).toBe(`${MINUS}$1`);
    expect(formatMoney(-49, { decimals: "never" })).toBe("$0");
  });

  it("hides .00 in auto mode", () => {
    expect(formatMoney(160000, { decimals: "auto" })).toBe("$1,600");
    expect(formatMoney(160050, { decimals: "auto" })).toBe("$1,600.50");
  });

  it("can mark money in with a plus or drop the sign", () => {
    expect(formatMoney(326000, { sign: "always" })).toBe("+$3,260.00");
    expect(formatMoney(-326000, { sign: "always" })).toBe(`${MINUS}$3,260.00`);
    expect(formatMoney(-326000, { sign: "never" })).toBe("$3,260.00");
  });

  it("refuses anything that isn't whole cents", () => {
    expect(() => formatMoney(1.5)).toThrow(RangeError);
    expect(() => formatMoney(Number.NaN)).toThrow(RangeError);
    expect(() => formatMoney(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it("formats costs as A$", () => {
    expect(formatCost(1600)).toBe("A$16");
    expect(formatCost(16000)).toBe("A$160");
    expect(formatCost(2450)).toBe("A$24.50");
  });
});

describe("parseMoney", () => {
  it.each([
    ["$1,234.56", 123456],
    ["1234.56", 123456],
    ["1234", 123400],
    ["1,234", 123400],
    ["86.2", 8620],
    [".5", 50],
    ["5.", 500],
    ["0", 0],
    ["0.00", 0],
    ["-0.00", 0],
    ["-86.20", -8620],
    ["−$86.20", -8620],
    ["-$86.20", -8620],
    ["$-86.20", -8620],
    ["(86.20)", -8620],
    ["86.20-", -8620],
    ["+5", 500],
    ["  $ 12.30 ", 1230],
    ["A$16", 1600],
    ["AUD 16", 1600],
    ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ])("reads %s as %d cents", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each([
    "",
    " ",
    "abc",
    "1.234",
    "1,23",
    "12,34.00",
    "$",
    ".",
    "--5",
    "1e5",
    "90071992547409.92",
  ])("rejects %j", (input) => {
    expect(parseMoney(input)).toBeNull();
  });

  it("round-trips with formatMoney", () => {
    for (const cents of [0, 1, -1, 99, -100, 123456, -987654321]) {
      expect(parseMoney(formatMoney(cents))).toBe(cents);
    }
  });
});

describe("sumCents", () => {
  it("adds positives, negatives and zero", () => {
    expect(sumCents([])).toBe(0);
    expect(sumCents([100, -250, 0, 75])).toBe(-75);
  });

  it("is exact where floats are not", () => {
    // 0.1 + 0.2 !== 0.3 in floating point, but 10 + 20 cents is exactly 30.
    expect(sumCents([10, 20])).toBe(30);
    expect(sumCents(Array.from({ length: 1000 }, () => 1))).toBe(1000);
  });

  it("refuses fractions and unsafe totals", () => {
    expect(() => sumCents([1.5])).toThrow(RangeError);
    expect(() => sumCents([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
  });
});

describe("allocateCents", () => {
  it("never loses a cent", () => {
    expect(allocateCents(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocateCents(-1000, [1, 1, 1])).toEqual([-334, -333, -333]);
    expect(allocateCents(10001, [1, 1])).toEqual([5001, 5000]);
  });

  it("follows the weights", () => {
    expect(allocateCents(12000, [3, 1])).toEqual([9000, 3000]);
    expect(allocateCents(0, [1, 2])).toEqual([0, 0]);
    expect(allocateCents(100, [0, 1])).toEqual([0, 100]);
  });

  it("refuses bad weights", () => {
    expect(() => allocateCents(100, [])).toThrow(RangeError);
    expect(() => allocateCents(100, [0, 0])).toThrow(RangeError);
    expect(() => allocateCents(100, [-1, 2])).toThrow(RangeError);
  });
});

describe("percentages", () => {
  it("works out ratios, with null when there's nothing to compare against", () => {
    expect(ratio(25, 100)).toBe(0.25);
    expect(ratio(5, 0)).toBeNull();
    expect(ratio(-50, 200)).toBe(-0.25);
  });

  it("works out change", () => {
    expect(percentChange(100, 150)).toBe(0.5);
    expect(percentChange(-100, -50)).toBe(0.5);
    expect(percentChange(0, 10)).toBeNull();
  });

  it("formats percentages", () => {
    expect(formatPercent(0.42)).toBe("42%");
    expect(formatPercent(0.4251, 1)).toBe("42.5%");
    expect(formatPercent(-0.051)).toBe(`${MINUS}5%`);
    expect(formatPercent(-0.001)).toBe("0%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(null)).toBe("–");
  });
});
