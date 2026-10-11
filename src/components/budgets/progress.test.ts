import { describe, expect, it } from "vitest";
import type { BudgetLine } from "@/lib/access";
import {
  averageWords,
  goneParts,
  kindLine,
  lineStatus,
  outsideWords,
  periodLine,
  periodTitle,
} from "./progress";

const MONTH = { period: "monthly", anchor: null } as const;
const OCTOBER = { start: "2026-10-01", end: "2026-10-31" };

const line = (more: Partial<BudgetLine> = {}, budget: Partial<BudgetLine["budget"]> = {}) =>
  ({
    budget: {
      id: "b",
      scope: "personal",
      ownerMemberId: "olive",
      categoryId: "groceries",
      amountCents: 20_700,
      period: "weekly",
      periodAnchor: null,
      periodEnd: null,
      periodSecondDay: null,
      rollover: false,
      onSetDates: false,
      alert80: true,
      alert100: true,
      since: "2026-03-01",
      ...budget,
    },
    category: {
      id: "groceries",
      name: "Groceries",
      icon: "cart",
      colourSlot: 2,
      kind: "spending",
      countsTowardBudgets: true,
    },
    kind: "flex",
    days: OCTOBER,
    planned: 89_700,
    carried: 0,
    spent: 21_400,
    expected: 28_935,
    pace: { kind: "behind", cents: 7_535 },
    spentOn: ["2026-10-03"],
    usualOn: null,
    nextOn: null,
    today: 10 / 31,
    ...more,
  }) satisfies BudgetLine;

describe("the period", () => {
  it("reads as a month, or as its days", () => {
    expect(periodTitle(OCTOBER)).toBe("October 2026");
    expect(periodTitle({ start: "2026-10-09", end: "2026-10-22" })).toBe("Fri 9 Oct to Thu 22 Oct");
    expect(periodTitle({ start: "2026-10-15", end: "2026-11-14" })).toBe(
      "Thu 15 Oct to Sat 14 Nov",
    );
    expect(periodLine({ spec: MONTH, period: OCTOBER, day: { day: 10, of: 31 } })).toBe(
      "Monthly · day 10 of 31",
    );
    expect(
      periodLine({ spec: MONTH, period: { start: "2026-09-01", end: "2026-09-30" }, day: null }),
    ).toBe("Monthly · ended Wed 30 Sep");
  });
});

describe("each budget", () => {
  it("says how everyday spending is going", () => {
    expect(lineStatus(line(), false)).toMatchObject({ tone: "good", text: "$75 under pace" });
    expect(lineStatus(line({ pace: { kind: "ahead", cents: 4_800 } }), false)).toMatchObject({
      tone: "warn",
      text: "$48 over pace",
    });
    expect(lineStatus(line({ pace: { kind: "on", cents: 0 } }), false).text).toBe("On pace");
    expect(lineStatus(line({ pace: { kind: "over", cents: 2_600 } }), false)).toMatchObject({
      tone: "crit",
      text: "Over by $26",
    });
    // Once the period's over, it's the result to the dollar.
    expect(lineStatus(line({ spent: 89_000, pace: { kind: "on", cents: 0 } }), true).text).toBe(
      "$7 under budget",
    );
  });

  it("says when a bill was paid or usually comes out", () => {
    const bill = (more: Partial<BudgetLine>) =>
      lineStatus(line({ kind: "set", today: null, pace: { kind: "on", cents: 0 }, ...more }), false)
        .text;
    expect(bill({ spentOn: ["2026-10-01"] })).toBe("Paid on 1 Oct");
    expect(bill({ spentOn: ["2026-10-02", "2026-10-09"] })).toBe("Paid 2 times, last on 9 Oct");
    expect(bill({ spentOn: [], expected: 0, usualOn: "2026-10-14", nextOn: "2026-10-14" })).toBe(
      "Usually comes out around Wed 14 Oct",
    );
    expect(bill({ spentOn: [], expected: 0, nextOn: "2026-11-01" })).toBe(
      "Not due until around Sun 1 Nov",
    );
    expect(bill({ spentOn: [], expected: 225_000, usualOn: "2026-10-01" })).toBe(
      "Usually out by 1 Oct, not paid yet",
    );
    expect(bill({ spentOn: [], expected: 0 })).toBe("Nothing paid yet");
  });

  it("says what rolled over", () => {
    expect(lineStatus(line({ kind: "roll", carried: 4_000 }), false)).toMatchObject({
      icon: "rollover",
      text: "Includes $40 rolled over",
    });
  });

  it("says how often it runs against the page's period", () => {
    expect(kindLine(line(), MONTH)).toBe("Weekly, $207 a week, shown for the month");
    expect(kindLine(line({}, { period: "monthly", amountCents: 40_000 }), MONTH)).toBe("Monthly");
    const fortnight = { period: "fortnightly", anchor: "2026-10-09" } as const;
    const rent = { period: "monthly", amountCents: 225_000, onSetDates: true } as const;
    expect(kindLine(line({ kind: "set", nextOn: "2026-11-01" }, rent), fortnight)).toBe(
      "Monthly, $2,250 a month, counted when it's due",
    );
    expect(kindLine(line({ kind: "set" }, rent), fortnight)).toBe(
      "Monthly, $2,250 a month, shown for the fortnight",
    );
    expect(kindLine(line({ kind: "roll" }, { period: "monthly" }), MONTH)).toBe(
      "Monthly · anything left rolls over",
    );
    expect(
      kindLine(
        line(
          {},
          {
            period: "custom",
            amountCents: 140_000,
            periodAnchor: "2027-04-02",
            periodEnd: "2027-04-15",
          },
        ),
        MONTH,
      ),
    ).toBe("Custom, $1,400 for 2 Apr to 15 Apr (14 days)");
  });
});

describe("the page's totals", () => {
  it("keeps the biggest five, then everything else", () => {
    const named = (name: string, spent: number) =>
      line({ spent, category: { ...line().category, id: name, name, colourSlot: null } });
    const lines = [100, 600, 500, 400, 300, 200, 50].map((spent, i) => named(`c${i}`, spent));
    expect(goneParts(lines).map((part) => [part.label, part.cents])).toEqual([
      ["c1", 600],
      ["c2", 500],
      ["c3", 400],
      ["c4", 300],
      ["c5", 200],
      ["Everything else", 150],
    ]);
    expect(goneParts(lines.slice(0, 6)).map((part) => part.label)).toEqual([
      "c1",
      "c2",
      "c3",
      "c4",
      "c5",
      "c0",
    ]);
  });

  it("mentions spending no budget covers", () => {
    expect(outsideWords({ cents: 0, unsorted: 0 })).toBeNull();
    expect(outsideWords({ cents: 7_300, unsorted: 0 })).toBe(
      "Plus $73 spent on things without a budget.",
    );
    expect(outsideWords({ cents: 4_500, unsorted: 1_500 })).toBe(
      "Plus $45 spent without a budget, $15 of it not sorted yet.",
    );
    expect(outsideWords({ cents: 1_500, unsorted: 1_500 })).toBe(
      "Plus $15 not sorted into a category yet.",
    );
  });

  it("says what the average is over", () => {
    const review = (periods: number) => ({ period: OCTOBER, periods, rows: [] });
    expect(averageWords(review(6), MONTH)).toBe(
      "Usually is the average per month over the last 6 months.",
    );
    expect(averageWords(review(13), { period: "fortnightly", anchor: "2026-10-09" })).toBe(
      "Usually is the average per fortnight over the last 13 fortnights.",
    );
    expect(averageWords(review(1), MONTH)).toBe(
      "Usually is that month too, since it's the only whole one so far.",
    );
  });
});
