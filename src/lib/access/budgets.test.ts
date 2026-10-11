import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import type { Db } from "@/lib/db";
import { budgets, categories, households, members, users } from "@/lib/db/schema";
import { budgetsOf, savePlan, tidyBudget, type BudgetDraft, type Viewer } from ".";

/** Olive and Pat share a household. Each sets their own budgets. */
const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  away: "00000000-0000-4000-8000-000000000002",
  olive: "00000000-0000-4000-8000-0000000000a1",
  pat: "00000000-0000-4000-8000-0000000000a2",
  sam: "00000000-0000-4000-8000-0000000000a3",
  groceries: "00000000-0000-4000-8000-000000000c01",
  housing: "00000000-0000-4000-8000-000000000c02",
  income: "00000000-0000-4000-8000-000000000c03",
  old: "00000000-0000-4000-8000-000000000c04",
  holidays: "00000000-0000-4000-8000-000000000c05",
  elsewhere: "00000000-0000-4000-8000-000000000c06",
};
const olive: Viewer = { memberId: ids.olive, householdId: ids.home };
const pat: Viewer = { memberId: ids.pat, householdId: ids.home };
const stranger: Viewer = { memberId: ids.sam, householdId: ids.home };

const draft = (categoryId: string, more: Partial<BudgetDraft> = {}): BudgetDraft => ({
  id: null,
  categoryId,
  amountCents: 20_000,
  period: "weekly",
  periodAnchor: null,
  periodEnd: null,
  periodSecondDay: null,
  rollover: false,
  onSetDates: false,
  alert80: true,
  alert100: true,
  ...more,
});

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(households).values([
    { id: ids.home, name: "Home" },
    { id: ids.away, name: "Away" },
  ]);
  const [o, p, s] = await db
    .insert(users)
    .values([
      { name: "Olive", email: "olive@example.com" },
      { name: "Pat", email: "pat@example.com" },
      { name: "Sam", email: "sam@example.com" },
    ])
    .returning();
  await db.insert(members).values([
    { id: ids.olive, householdId: ids.home, userId: o.id, role: "owner", displayName: "Olive" },
    { id: ids.pat, householdId: ids.home, userId: p.id, role: "partner", displayName: "Pat" },
    { id: ids.sam, householdId: ids.away, userId: s.id, role: "owner", displayName: "Sam" },
  ]);
  await db.insert(categories).values([
    { id: ids.groceries, householdId: ids.home, name: "Groceries", sortOrder: 2 },
    { id: ids.housing, householdId: ids.home, name: "Housing", sortOrder: 1 },
    { id: ids.income, householdId: ids.home, name: "Income", kind: "income", sortOrder: 3 },
    { id: ids.old, householdId: ids.home, name: "Old", archived: true, sortOrder: 4 },
    {
      id: ids.holidays,
      householdId: ids.home,
      name: "Holidays",
      countsTowardBudgets: false,
      sortOrder: 5,
    },
    { id: ids.elsewhere, householdId: ids.away, name: "Groceries" },
  ]);
});

afterAll(async () => {
  await close();
});

beforeEach(async () => {
  await db.delete(budgets);
});

describe("savePlan", () => {
  it("saves a weekly and a monthly budget, in the household's category order", async () => {
    const saved = await savePlan(db, olive, {
      budgets: [
        draft(ids.groceries),
        draft(ids.housing, {
          amountCents: 225_000,
          period: "monthly",
          onSetDates: true,
          alert80: false,
        }),
      ],
      removed: [],
    });
    expect(saved.ok).toBe(true);
    const mine = await budgetsOf(db, olive);
    expect(mine.map((b) => [b.categoryId, b.amountCents, b.period, b.scope])).toEqual([
      [ids.housing, 225_000, "monthly", "personal"],
      [ids.groceries, 20_000, "weekly", "personal"],
    ]);
    expect(mine[0]).toMatchObject({ onSetDates: true, alert80: false, ownerMemberId: ids.olive });
    expect(saved.ok && saved.budgets).toEqual(mine);
  });

  it("keeps budgets personal: no one else sees or changes them", async () => {
    await savePlan(db, olive, { budgets: [draft(ids.groceries)], removed: [] });
    const [groceries] = await budgetsOf(db, olive);
    expect(await budgetsOf(db, pat)).toEqual([]);

    // Pat's change to Olive's budget becomes Pat's own, and Pat can't remove Olive's.
    await savePlan(db, pat, {
      budgets: [draft(ids.groceries, { id: groceries.id, amountCents: 1_00 })],
      removed: [],
    });
    await savePlan(db, pat, { budgets: [], removed: [groceries.id] });
    expect(await budgetsOf(db, olive)).toEqual([groceries]);
    expect((await budgetsOf(db, pat)).map((b) => b.amountCents)).toEqual([1_00]);
  });

  it("changes and removes the viewer's budgets", async () => {
    await savePlan(db, olive, {
      budgets: [draft(ids.groceries), draft(ids.housing)],
      removed: [],
    });
    const [housing, groceries] = await budgetsOf(db, olive);
    await savePlan(db, olive, {
      budgets: [{ ...groceries, amountCents: 21_000, rollover: true }],
      removed: [housing.id],
    });
    const after = await budgetsOf(db, olive);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: groceries.id, amountCents: 21_000, rollover: true });
  });

  it("changes the category's budget when the same new budget comes twice", async () => {
    await savePlan(db, olive, { budgets: [draft(ids.groceries)], removed: [] });
    await savePlan(db, olive, {
      budgets: [draft(ids.groceries, { amountCents: 25_000 })],
      removed: [],
    });
    expect((await budgetsOf(db, olive)).map((b) => b.amountCents)).toEqual([25_000]);
  });

  it("only uses spending categories that count toward budgets", async () => {
    for (const categoryId of [ids.income, ids.old, ids.holidays, ids.elsewhere]) {
      expect(await savePlan(db, olive, { budgets: [draft(categoryId)], removed: [] })).toEqual({
        ok: false,
        error: "Pick a category that counts toward budgets.",
      });
    }
    expect(await budgetsOf(db, olive)).toEqual([]);
  });

  it("leaves out a budget while its category doesn't count toward budgets", async () => {
    await savePlan(db, olive, { budgets: [draft(ids.groceries)], removed: [] });
    const counts = (on: boolean) =>
      db
        .update(categories)
        .set({ countsTowardBudgets: on })
        .where(eq(categories.id, ids.groceries));
    await counts(false);
    expect(await budgetsOf(db, olive)).toEqual([]);
    await counts(true);
    expect(await budgetsOf(db, olive)).toHaveLength(1);
  });

  it("saves all of a change or none of it", async () => {
    const result = await savePlan(db, olive, {
      budgets: [draft(ids.housing), draft(ids.groceries, { amountCents: 0 })],
      removed: [],
    });
    expect(result).toEqual({ ok: false, error: "Set an amount for Groceries." });
    expect(await budgetsOf(db, olive)).toEqual([]);
  });

  it("says what's wrong in plain words", async () => {
    const problem = async (more: Partial<BudgetDraft>, categoryId = ids.groceries) => {
      const result = await savePlan(db, olive, { budgets: [draft(categoryId, more)], removed: [] });
      return result.ok ? null : result.error;
    };
    expect(await problem({ amountCents: 12.5 })).toBe("Set an amount for Groceries.");
    expect(await problem({ amountCents: 100_000_001 })).toBe(
      "That's more than one budget can hold. Set a smaller amount for Groceries.",
    );
    expect(await problem({ period: "daily" as BudgetDraft["period"] })).toBe(
      "Pick how often Groceries runs.",
    );
    expect(await problem({ periodAnchor: "2026-02-30" })).toBe("Pick a real date for Groceries.");
    expect(await problem({ period: "custom", periodAnchor: "2027-04-02" })).toBe(
      "Pick the first and last days for Groceries.",
    );
    expect(
      await problem({ period: "custom", periodAnchor: "2027-04-02", periodEnd: "2027-04-01" }),
    ).toBe("Groceries ends before it starts. Pick the last day again.");
    expect(
      await problem({ period: "custom", periodAnchor: "2027-04-02", periodEnd: "2029-04-02" }),
    ).toBe("A custom budget can run for up to two years. Pick an earlier last day for Groceries.");
    expect(await problem({ period: "twice_monthly", periodAnchor: "2024-01-01" })).toBe(
      "Pick both days of the month for Groceries.",
    );
    expect(
      await problem({ period: "twice_monthly", periodAnchor: "2024-01-15", periodSecondDay: 15 }),
    ).toBe("Pick two different days for Groceries.");
    expect(
      await savePlan(db, olive, {
        budgets: [draft(ids.groceries), draft(ids.groceries)],
        removed: [],
      }),
    ).toEqual({ ok: false, error: "Groceries has two budgets here. Keep one of them." });
  });

  it("refuses someone from another household", async () => {
    expect(await savePlan(db, stranger, { budgets: [draft(ids.groceries)], removed: [] })).toEqual({
      ok: false,
      error: "You can't change budgets here.",
    });
    expect(await budgetsOf(db, stranger)).toEqual([]);
  });

  it("stores only what each period uses", async () => {
    await savePlan(db, olive, {
      budgets: [
        draft(ids.groceries, {
          period: "custom",
          periodAnchor: "2027-04-02",
          periodEnd: "2027-04-15",
          periodSecondDay: 20,
          rollover: true,
        }),
        draft(ids.housing, {
          period: "quarterly",
          periodAnchor: "2026-01-15",
          periodEnd: "2026-03-31",
          rollover: true,
          onSetDates: true,
        }),
      ],
      removed: [],
    });
    const [housing, groceries] = await budgetsOf(db, olive);
    expect(groceries).toMatchObject({
      periodAnchor: "2027-04-02",
      periodEnd: "2027-04-15",
      periodSecondDay: null,
      rollover: false,
    });
    expect(housing).toMatchObject({
      periodAnchor: null,
      periodEnd: null,
      rollover: true,
      onSetDates: false,
    });
  });
});

describe("tidyBudget", () => {
  it("keeps a twice-monthly budget's second day and a set-dates budget that doesn't roll over", () => {
    const twice = draft(ids.groceries, {
      period: "twice_monthly",
      periodAnchor: "2024-01-01",
      periodSecondDay: 16,
      onSetDates: true,
    });
    expect(tidyBudget(twice)).toEqual(twice);
  });
});
