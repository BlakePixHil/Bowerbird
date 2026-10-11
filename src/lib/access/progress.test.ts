import { describe, expect, it } from "vitest";
import type { DaySpend, PeriodSpec } from "@/lib/money";
import type { BudgetDraft } from "./plan";
import { progressOf, type ProgressBudget, type ProgressCategory } from "./progress";

const MONTH: PeriodSpec = { period: "monthly", anchor: null };
const OCTOBER = { start: "2026-10-01", end: "2026-10-31" };
const SEPTEMBER = { start: "2026-09-01", end: "2026-09-30" };
const TODAY = "2026-10-10";

const category = (id: string, more: Partial<ProgressCategory> = {}): ProgressCategory => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  icon: null,
  colourSlot: null,
  kind: "spending",
  countsTowardBudgets: true,
  ...more,
});

const budget = (
  categoryId: string,
  amountCents: number,
  more: Partial<Omit<BudgetDraft, "id"> & { since: string }> = {},
): ProgressBudget => ({
  id: `b-${categoryId}`,
  scope: "personal",
  ownerMemberId: "olive",
  categoryId,
  amountCents,
  period: "monthly",
  periodAnchor: null,
  periodEnd: null,
  periodSecondDay: null,
  rollover: false,
  onSetDates: false,
  alert80: true,
  alert100: true,
  since: "2026-03-01",
  ...more,
});

const on = (...days: [string, number][]): DaySpend[] =>
  days.map(([date, cents]) => ({ date, cents }));
const firstOfEach = (cents: number) =>
  on(
    ...["03", "04", "05", "06", "07", "08", "09", "10"].map((m): [string, number] => [
      `2026-${m}-01`,
      cents,
    ]),
  );

const categories = ["housing", "groceries", "shopping", "bills", "health", "trip", "gifts"].map(
  (id) => category(id),
);
const budgets = [
  budget("housing", 225_000, { onSetDates: true }),
  budget("groceries", 20_700, { period: "weekly" }),
  budget("shopping", 20_000),
  budget("bills", 28_000, { onSetDates: true }),
  budget("health", 15_000, { rollover: true, since: "2026-08-15" }),
  budget("trip", 140_000, {
    period: "custom",
    periodAnchor: "2026-11-01",
    periodEnd: "2026-11-14",
  }),
];
const days = new Map<string | null, DaySpend[]>([
  ["housing", firstOfEach(225_000)],
  [
    "groceries",
    on(
      ["2026-09-03", 22_000],
      ["2026-09-10", 22_000],
      ["2026-09-17", 22_000],
      ["2026-09-24", 22_000],
      ["2026-10-03", 21_400],
    ),
  ],
  ["shopping", on(["2026-09-12", 15_000], ["2026-10-05", 22_600])],
  ["bills", on(["2026-09-14", 18_640])],
  ["health", on(["2026-06-02", 9_000], ["2026-08-20", 11_000], ["2026-10-02", 5_000])],
  ["gifts", on(["2026-10-06", 3_000])],
  [null, on(["2026-10-07", 1_500])],
]);

const input = {
  today: TODAY,
  spec: MONTH,
  period: OCTOBER,
  budgets,
  categories,
  days,
  firstDay: "2026-03-01",
};

describe("one period of budgets", () => {
  const progress = progressOf(input);
  const line = (id: string) => progress.lines.find((l) => l.category.id === id)!;

  it("shows every budget for the month, and a trip only once its days come", () => {
    expect(progress.day).toEqual({ day: 10, of: 31 });
    expect(progress.lines.map((l) => l.category.id)).toEqual([
      "housing",
      "groceries",
      "shopping",
      "bills",
      "health",
    ]);
    // $207 a week is $207 × 52 ÷ 12 = $897 for the month.
    expect(line("groceries")).toMatchObject({ planned: 89_700, spent: 21_400, today: 10 / 31 });
  });

  it("builds everyday spending up evenly and counts bills on their usual day", () => {
    // 10 of 31 days of $897.
    expect(line("groceries")).toMatchObject({
      expected: 28_935,
      pace: { kind: "behind", cents: 7_535 },
    });
    // Rent came out on the 1st last month, so it's expected in full already.
    expect(line("housing")).toMatchObject({
      expected: 225_000,
      pace: { kind: "on" },
      spentOn: ["2026-10-01"],
      today: null,
    });
    // Last month's bill came on the 14th, so nothing's expected yet.
    expect(line("bills")).toMatchObject({
      planned: 28_000,
      expected: 0,
      spent: 0,
      usualOn: "2026-10-14",
      nextOn: "2026-10-14",
    });
    expect(line("shopping").pace).toEqual({ kind: "over", cents: 2_600 });
  });

  it("rolls over what's left from the month it was set in, not before", () => {
    // August: $150 less $110. September: nothing spent. June's spending was before it existed.
    expect(line("health")).toMatchObject({
      carried: 19_000,
      planned: 34_000,
      spent: 5_000,
      expected: 10_968,
    });
  });

  it("adds up the period, with pace from everyday spending only", () => {
    expect(progress.total).toEqual({ planned: 396_700, spent: 274_000, expected: 271_355 });
    expect(progress.setDates).toEqual({ planned: 253_000, spent: 225_000, expected: 225_000 });
    expect(progress.everyday).toEqual({ planned: 143_700, spent: 49_000, expected: 46_355 });
    // $26.45 ahead is inside 3% of $1,437.
    expect(progress.pace).toEqual({ kind: "on", cents: 0 });
    expect(progress.outside).toEqual({ cents: 4_500, unsorted: 1_500 });
    expect(progress.previous).toEqual(SEPTEMBER);
    expect(progress.next).toBeNull();
  });

  it("gives everyday spending day by day, this period and the one before", () => {
    expect(progress.daily.current).toEqual(
      on(["2026-10-02", 5_000], ["2026-10-03", 21_400], ["2026-10-05", 22_600]),
    );
    const total = progress.daily.current.reduce((all, day) => all + day.cents, 0);
    expect(total).toBe(progress.everyday.spent);
    // Bills, rent and categories without a budget stay out.
    expect(progress.daily.previous).toEqual(
      on(
        ["2026-09-03", 22_000],
        ["2026-09-10", 22_000],
        ["2026-09-12", 15_000],
        ["2026-09-17", 22_000],
        ["2026-09-24", 22_000],
      ),
    );
    // No line for a period that began before the data did.
    expect(progressOf({ ...input, firstDay: "2026-09-02" }).daily.previous).toBeNull();
  });

  it("looks back at last month, biggest gaps first, with the 6-month average", () => {
    const review = progress.review!;
    expect(review.period).toEqual(SEPTEMBER);
    expect(review.periods).toBe(6);
    expect(
      review.rows.map((row) => [row.line.category.id, row.line.planned, row.line.spent, row.gap]),
    ).toEqual([
      ["health", 19_000, 0, -19_000],
      ["bills", 28_000, 18_640, -9_360],
      ["shopping", 20_000, 15_000, -5_000],
      ["groceries", 89_700, 88_000, -1_700],
      ["housing", 225_000, 225_000, 0],
    ]);
    const average = (id: string) => review.rows.find((r) => r.line.category.id === id)!.average;
    expect(average("housing")).toBe(225_000);
    // Only September had groceries: $880 over six months.
    expect(average("groceries")).toBe(14_667);
    // June's $90 and August's $110, over April to September.
    expect(average("health")).toBe(3_333);
  });
});

describe("other periods", () => {
  it("shows a finished month in full, and the next month once it's begun", () => {
    const september = progressOf({ ...input, period: SEPTEMBER });
    expect(september.day).toBeNull();
    expect(september.next).toEqual(OCTOBER);
    const groceries = september.lines.find((l) => l.category.id === "groceries")!;
    expect(groceries).toMatchObject({ expected: 89_700, spent: 88_000, pace: { kind: "on" } });
  });

  it("has nothing to look back on until a whole period has passed", () => {
    expect(progressOf({ ...input, firstDay: "2026-09-02" }).review).toBeNull();
    expect(progressOf({ ...input, firstDay: null }).review).toBeNull();
    expect(progressOf({ ...input, firstDay: "2026-09-01" }).review?.periods).toBe(1);
  });

  it("follows a fortnightly pay cycle", () => {
    const fortnight = progressOf({
      ...input,
      spec: { period: "fortnightly", anchor: "2026-10-09" },
      period: { start: "2026-10-09", end: "2026-10-22" },
    });
    expect(fortnight.day).toEqual({ day: 2, of: 14 });
    const planned = (id: string) => fortnight.lines.find((l) => l.category.id === id)!.planned;
    expect(planned("groceries")).toBe(41_400);
    // Rent goes out on the 1st, so it's all in the fortnight before and none in this one.
    expect(fortnight.lines.find((l) => l.category.id === "housing")).toMatchObject({
      planned: 0,
      expected: 0,
      nextOn: "2026-11-01",
    });
    const before = progressOf({
      ...input,
      spec: { period: "fortnightly", anchor: "2026-10-09" },
      period: { start: "2026-09-25", end: "2026-10-08" },
    });
    expect(before.lines.find((l) => l.category.id === "housing")).toMatchObject({
      planned: 225_000,
      expected: 225_000,
      spent: 225_000,
    });
  });

  it("counts a trip's share of its days", () => {
    const november = progressOf({
      ...input,
      today: "2026-11-05",
      period: { start: "2026-11-01", end: "2026-11-30" },
    });
    const trip = november.lines.find((l) => l.category.id === "trip")!;
    expect(trip).toMatchObject({
      planned: 140_000,
      days: { start: "2026-11-01", end: "2026-11-14" },
      expected: 50_000,
    });
  });
});
