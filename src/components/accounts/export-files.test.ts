import { describe, expect, it } from "vitest";
import type { ExportData } from "@/lib/access";
import { exportFiles, exportName } from "./export-files";

const food = { id: "c-food", name: "Food", kind: "spending", icon: null, colourSlot: 2 } as const;

const DATA: ExportData = {
  accounts: [
    {
      id: "a-mine",
      ownerMemberId: "m-olive",
      isJoint: false,
      visibility: "private",
      name: "Everyday",
      institution: "First Bank",
      kind: "everyday",
      includeInBudgets: true,
      manual: false,
      archived: false,
      access: "full",
      whose: "mine",
      ownerName: null,
      live: true,
    },
    {
      id: "a-card",
      ownerMemberId: "m-pat",
      isJoint: false,
      visibility: "balance_only",
      name: "Card, travel",
      institution: null,
      kind: "credit",
      includeInBudgets: false,
      manual: false,
      archived: true,
      access: "balance_only",
      whose: "partner",
      ownerName: "Pat",
      live: false,
    },
  ],
  transactions: [
    {
      id: "t-1",
      date: "2026-10-02",
      accountId: "a-mine",
      description: "=SUM(A1)",
      shop: "Corner Cafe",
      amountCents: -1_234_56,
      categoryId: "c-food",
      pending: false,
      transfer: false,
      note: 'Said "hi"',
      source: "file",
      tags: ["Trip", "Work"],
    },
  ],
  splits: [{ transactionId: "t-1", categoryId: "c-food", amountCents: -1_000_00 }],
  categories: [
    {
      id: "c-food",
      name: "Food",
      kind: "spending",
      countsTowardBudgets: true,
      archived: false,
      colourSlot: 2,
    },
  ],
  rules: [
    {
      id: "r-1",
      shop: null,
      matchText: "TO JOINT",
      category: food,
      tag: null,
      enabled: true,
      sorted: 3,
      createdAt: new Date(0),
    },
  ],
  budgets: [
    {
      id: "b-1",
      categoryId: "c-food",
      scope: "household",
      amountCents: 600_00,
      period: "monthly",
      periodAnchor: null,
      periodEnd: null,
      periodSecondDay: null,
      rollover: false,
      onSetDates: false,
      alert80: true,
      alert100: true,
    },
  ],
  incomes: [
    {
      id: "i-1",
      label: "Pay",
      amountCents: 3_000_00,
      frequency: "fortnightly",
      anchorDate: "2026-10-01",
      secondDay: null,
      accountId: "a-mine",
    },
  ],
  balances: [
    { accountId: "a-mine", date: "2026-10-01", balanceCents: 10_00, workedOut: false },
    { accountId: "a-mine", date: "2026-10-02", balanceCents: 20_00, workedOut: true },
  ],
};

function files(data = DATA): Map<string, string[]> {
  const decoder = new TextDecoder();
  return new Map(
    [...exportFiles(data, "2026-10-11")].map((file) => [
      file.name,
      decoder.decode(file.data).replace(/^﻿/, "").split("\r\n").slice(0, -1),
    ]),
  );
}

describe("Export everything files", () => {
  it("has one CSV for each kind of thing, in a folder named for the day", () => {
    expect(exportName("2026-10-11")).toBe("bowerbird-export-2026-10-11");
    expect([...files().keys()]).toEqual(
      [
        "accounts",
        "transactions",
        "splits",
        "categories",
        "rules",
        "budgets",
        "incomes",
        "balances",
      ].map((name) => `bowerbird-export-2026-10-11/${name}.csv`),
    );
  });

  it("writes accounts with whose they are and their latest balance", () => {
    const lines = files().get("bowerbird-export-2026-10-11/accounts.csv")!;
    expect(lines).toEqual([
      "Account,Bank,Kind,Whose,Who can see it,You see,Counts toward budgets,Archived,Comes in by,Latest balance,Latest balance date",
      "Everyday,First Bank,Everyday,Yours,Private,Everything,Yes,No,Live sync,20.00,2026-10-02",
      '"Card, travel",,Credit card,Pat’s,Balance only,Balance only,No,Yes,Bank files,,',
    ]);
  });

  it("writes transactions in dollars, with category, tags and a safe description", () => {
    const lines = files().get("bowerbird-export-2026-10-11/transactions.csv")!;
    expect(lines[1]).toBe(
      `2026-10-02,Everyday,'=SUM(A1),Corner Cafe,-1234.56,Food,Yes,Trip; Work,"Said ""hi""",No,No,Bank file,t-1`,
    );
    const splits = files().get("bowerbird-export-2026-10-11/splits.csv")!;
    expect(splits[1]).toBe("2026-10-02,Everyday,'=SUM(A1),-1000.00,Food,t-1");
  });

  it("writes rules, budgets, pay and balances in the app's words", () => {
    const all = files();
    const at = (name: string) => all.get(`bowerbird-export-2026-10-11/${name}.csv`)!;
    expect(at("categories")[1]).toBe("Food,Spending,Yes,No,Colour 2");
    expect(at("rules")[1]).toBe("TO JOINT,Bank text,Food,,Yes,3");
    expect(at("budgets")[1]).toMatch(/^Food,Household,600\.00,/);
    expect(at("incomes")[1]).toMatch(/^Pay,3000\.00,[^,]+,2026-10-01,,Everyday$/);
    expect(at("balances").slice(1)).toEqual([
      "2026-10-01,Everyday,10.00,No",
      "2026-10-02,Everyday,20.00,Yes",
    ]);
  });

  it("still has every file, with just its headings, when there's nothing to put in it", () => {
    const empty = files({
      accounts: [],
      transactions: [],
      splits: [],
      categories: [],
      rules: [],
      budgets: [],
      incomes: [],
      balances: [],
    });
    expect(empty.size).toBe(8);
    for (const lines of empty.values()) expect(lines).toHaveLength(1);
  });
});
