import { describe, expect, it } from "vitest";
import type { CategoryMonth, SourceMonth } from "@/lib/access";
import {
  bestAndWorst,
  changeLine,
  financialYearStart,
  keptFacts,
  monthStatus,
  moneyReport,
  rangeMonths,
  reportFrom,
  shareWords,
  signedDiff,
  summaryWords,
  vsUsual,
  type ReportInput,
} from "./money";

const TODAY = "2026-10-11";
const SINCE = "2026-06-20";

const categories = [
  { id: "housing", name: "Housing", colourSlot: 1 },
  { id: "groceries", name: "Groceries", colourSlot: 2 },
  { id: "travel", name: "Travel", colourSlot: 7 },
];

const spent = (month: string, cents: Record<string, number>): CategoryMonth[] =>
  Object.entries(cents).map(([id, out]) => ({
    month,
    categoryId: id === "none" ? null : id,
    out,
  }));

const input = (more: Partial<ReportInput> = {}): ReportInput => ({
  range: "12m",
  months: rangeMonths("12m", TODAY, SINCE),
  since: SINCE,
  sums: [
    { month: "2026-06", in: 652_000, out: 500_000 },
    { month: "2026-07", in: 652_000, out: 480_000 },
    { month: "2026-08", in: 978_000, out: 700_000 },
    { month: "2026-09", in: 652_000, out: 650_000 },
  ],
  byCategory: [
    ...spent("2026-06", { housing: 225_000, groceries: 80_000, none: 195_000 }),
    ...spent("2026-07", { housing: 225_000, groceries: 80_000, none: 175_000 }),
    ...spent("2026-08", { housing: 225_000, groceries: 85_000, travel: 50_000, none: 340_000 }),
    ...spent("2026-09", { housing: 225_000, travel: 200_000, none: 135_000, groceries: 90_000 }),
  ],
  sources: (
    [
      ["ACME SALARY", 650_000, 2],
      ["INTEREST CREDIT", 450, 1],
      ["COLES REFUND", 1_000, 1],
      ["KMART 1077", 300, 1],
      ["BP CONNECT", 250, 1],
    ] as const
  ).map(([shop, cents, count]): SourceMonth => ({ month: "2026-09", shop, cents, count })),
  categories,
  ...more,
});

describe("the months a range covers", () => {
  it("takes the whole months before this one, never before money first came in", () => {
    const year = rangeMonths("12m", TODAY, "2024-01-05");
    expect([year.length, year[0], year.at(-1)]).toEqual([12, "2025-10-01", "2026-09-01"]);
    expect(rangeMonths("12m", TODAY, SINCE)).toEqual([
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
    ]);
    expect(rangeMonths("12m", TODAY, null)).toEqual([]);
    expect(reportFrom(year)).toBe("2025-04-01");
  });

  it("starts the financial year on 1 July", () => {
    expect(rangeMonths("fy", TODAY, "2024-01-05")).toEqual([
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
    ]);
    expect(rangeMonths("fy", "2026-07-15", "2024-01-05")).toEqual([]);
    expect(financialYearStart("2026-06-30")).toBe("2025-07-01");
    expect(financialYearStart("2026-07-01")).toBe("2026-07-01");
  });
});

describe("the report", () => {
  const report = moneyReport(input());
  const september = report.months.at(-1)!;

  it("adds up the range and says it in one sentence", () => {
    expect(report.totals).toEqual({
      in: 2_934_000,
      out: 2_330_000,
      kept: 604_000,
      share: 604_000 / 2_934_000,
    });
    expect(report.average).toEqual({ in: 733_500, out: 582_500 });
    expect(
      summaryWords(report)
        .map((w) => (w.strong ? `*${w.text}*` : w.text))
        .join(""),
    ).toBe(
      "From June to September you earned *$29,340* and spent *$23,300*. You kept *$6,040*, about a fifth of your pay.",
    );
    expect(september).toMatchObject({
      key: "2026-09",
      label: "SEP",
      name: "Sep 2026",
      long: "September 2026",
      word: "September",
      kept: 2_000,
    });
  });

  it("states the best and worst months as facts", () => {
    expect(keptFacts(report)).toBe(
      "August kept the most, 28% of pay. September kept the least, 0%.",
    );
    expect(bestAndWorst(report)).toEqual({
      value: "28% / 0%",
      line: "Kept in August, and in September",
    });
    // Against the range's 21%: two points above is better, eight below is tighter.
    expect(report.months.map((month) => monthStatus(month, report).text)).toEqual([
      "Better than usual",
      "Better than usual",
      "Better than usual",
      "Tighter than usual",
    ]);
    const level = { ...september, share: 0.2 };
    expect(monthStatus(level, report)).toMatchObject({ tone: "quiet", text: "About usual" });
  });

  it("lists where it went against the usual month, and the biggest changes", () => {
    expect(september.went.total).toBe(650_000);
    expect(september.went.rows.map((row) => [row.name, row.cents, row.usual, row.colour])).toEqual([
      ["Housing", 225_000, 225_000, "c1"],
      ["Travel", 200_000, 16_667, "c7"],
      ["Not sorted yet", 135_000, 236_667, "c-other"],
      ["Groceries", 90_000, 81_667, "c2"],
    ]);
    expect(september.went.changes.map((c) => [c.name, c.diff])).toEqual([
      ["Travel", 183_333],
      ["Not sorted yet", -101_667],
      ["Groceries", 8_333],
    ]);
    expect(changeLine(september)).toBe(
      "Travel was $1,833 above usual, the biggest change from your usual month.",
    );
    // The first month has nothing before it to compare with.
    expect(report.months[0].went.rows.every((row) => row.usual === null)).toBe(true);
    expect(changeLine(report.months[0])).toBeNull();
  });

  it("puts what's past the eighth category into Everything else", () => {
    const ten = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`c${i}`, 10_000 - i]));
    const many = moneyReport(input({ byCategory: spent("2026-09", ten) })).months.at(-1)!;
    expect(many.went.rows).toHaveLength(9);
    expect(many.went.rows.at(-1)).toMatchObject({
      name: "Everything else",
      cents: 9_992 + 9_991,
      usual: 0,
    });
  });

  it("lists where it came from, biggest first", () => {
    expect(september.came.map((row) => [row.label, row.cents, row.colour])).toEqual([
      ["ACME SALARY, 2 payments", 650_000, "seq2"],
      ["COLES REFUND", 1_000, "seq3"],
      ["INTEREST CREDIT", 450, "seq1"],
      ["Everything else, 2 payments", 550, "c-other"],
    ]);
  });

  it("says when more went out than came in", () => {
    const one = moneyReport(
      input({
        months: ["2026-09-01"],
        sums: [{ month: "2026-09", in: 300_000, out: 350_000 }],
      }),
    );
    expect(
      summaryWords(one)
        .map((w) => w.text)
        .join(""),
    ).toBe("In September you earned $3,000 and spent $3,500. You spent $500 more than you earned.");
    expect(keptFacts(one)).toBe("In September, $500 more went out than came in.");
    expect(bestAndWorst(one)).toBeNull();
  });
});

describe("words", () => {
  it("rounds a share to a simple fraction when it's close", () => {
    expect(shareWords(0.24)).toBe("about a quarter");
    expect(shareWords(0.5)).toBe("about half");
    expect(shareWords(0.37)).toBe("37%");
  });

  it("compares with a usual month", () => {
    expect(vsUsual(1_117_000, 1_171_300, "came in")).toBe("$543 less came in than a usual month");
    expect(vsUsual(890_000, 860_000, "went out")).toBe("$300 more went out than a usual month");
    expect(vsUsual(860_030, 860_000, "went out")).toBe("About the same as a usual month");
    expect(signedDiff(136_000)).toBe("+$1,360");
    expect(signedDiff(-12_000)).toBe("−$120");
  });
});
