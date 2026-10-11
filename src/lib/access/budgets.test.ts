import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import type { Db } from "@/lib/db";
import {
  accounts,
  budgets,
  categories,
  households,
  members,
  splits,
  transactions,
  users,
} from "@/lib/db/schema";
import { spentBy, type PeriodSpec } from "@/lib/money";
import {
  activityPage,
  budgetProgress,
  budgetsOf,
  savePlan,
  tidyBudget,
  type ActivityFilters,
  type ActivityRow,
  type BudgetDraft,
  type Viewer,
} from ".";

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
  everyday: "00000000-0000-4000-8000-0000000000e1",
  joint: "00000000-0000-4000-8000-0000000000e2",
  patPrivate: "00000000-0000-4000-8000-0000000000e3",
  business: "00000000-0000-4000-8000-0000000000e4",
  transfer: "00000000-0000-4000-8000-0000000000f1",
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

describe("budgetProgress", () => {
  const MONTH: PeriodSpec = { period: "monthly", anchor: null };
  const october = { start: "2026-10-01", end: "2026-10-31" };
  const view = { spec: MONTH, period: october, today: "2026-10-10", timeZone: "Australia/Sydney" };
  type NewRow = typeof transactions.$inferInsert;
  const row = (accountId: string, date: string, amountCents: number, more: Partial<NewRow> = {}) =>
    ({
      householdId: ids.home,
      accountId,
      date,
      amountCents,
      descriptionRaw: `ROW ${date} ${amountCents}`,
      source: "file",
      categoryId: ids.groceries,
      ...more,
    }) satisfies NewRow;

  beforeAll(async () => {
    await db.insert(accounts).values([
      { id: ids.everyday, householdId: ids.home, ownerMemberId: ids.olive, name: "Everyday" },
      {
        id: ids.joint,
        householdId: ids.home,
        ownerMemberId: ids.olive,
        name: "Joint",
        isJoint: true,
        visibility: "shared",
      },
      { id: ids.patPrivate, householdId: ids.home, ownerMemberId: ids.pat, name: "Pat's" },
      {
        id: ids.business,
        householdId: ids.home,
        ownerMemberId: ids.olive,
        name: "Business",
        includeInBudgets: false,
      },
    ]);
    await db.insert(transactions).values([
      row(ids.everyday, "2026-09-28", -5_000),
      row(ids.everyday, "2026-10-01", -8_620),
      row(ids.joint, "2026-10-04", -4_350, { pending: true }),
      // A refund isn't spending, and a transfer between the household's accounts isn't either.
      row(ids.everyday, "2026-10-05", 2_000),
      row(ids.everyday, "2026-10-06", -30_000, { transferGroupId: ids.transfer }),
      row(ids.joint, "2026-10-06", 30_000, { transferGroupId: ids.transfer }),
      // Pat's private account and an account left out of budgets don't count.
      row(ids.patPrivate, "2026-10-07", -9_999),
      row(ids.business, "2026-10-07", -12_345),
      row(ids.everyday, "2026-10-11", -7_000),
      row(ids.everyday, "2026-10-08", -1_500, { categoryId: null }),
    ]);
    const [split] = await db
      .insert(transactions)
      .values(row(ids.joint, "2026-10-09", -10_000, { categoryId: ids.groceries }))
      .returning({ id: transactions.id });
    await db.insert(splits).values([
      { transactionId: split.id, categoryId: ids.groceries, amountCents: -6_000 },
      { transactionId: split.id, categoryId: ids.housing, amountCents: -4_000 },
    ]);
  });

  /** Spending in a category the way Activity shows it, from every page of rows. */
  async function fromActivity(categoryId: string, filters: ActivityFilters) {
    const rows: ActivityRow[] = [];
    let before: string | undefined;
    for (;;) {
      const page = await activityPage(
        db,
        olive,
        "household",
        { ...filters, categoryIds: [categoryId] },
        before,
      );
      rows.push(...page.rows);
      if (!page.next) break;
      before = page.next;
    }
    return rows.reduce((total, r) => {
      if (r.parts.length === 0) return total + spentBy(r);
      const parts = r.parts.filter((part) => part.category.id === categoryId);
      return (
        total + parts.reduce((sum, part) => sum + spentBy({ ...r, amountCents: part.cents }), 0)
      );
    }, 0);
  }

  it("matches Activity for the same days and accounts", async () => {
    await savePlan(db, olive, {
      budgets: [
        draft(ids.groceries, { amountCents: 90_000, period: "monthly" }),
        draft(ids.housing, { amountCents: 225_000, period: "monthly", onSetDates: true }),
      ],
      removed: [],
    });
    const progress = await budgetProgress(db, olive, view);
    const spent = (id: string) => progress.lines.find((l) => l.category.id === id)!.spent;
    const counted = { accountIds: [ids.everyday, ids.joint], from: october.start, to: view.today };
    // $86.20 + $43.50 pending + $60 of the split row.
    expect(spent(ids.groceries)).toBe(18_970);
    expect(spent(ids.groceries)).toBe(await fromActivity(ids.groceries, counted));
    expect(spent(ids.housing)).toBe(4_000);
    expect(spent(ids.housing)).toBe(await fromActivity(ids.housing, counted));
    expect(progress.outside).toEqual({ cents: 1_500, unsorted: 1_500 });
  });

  it("is empty for someone outside the household", async () => {
    await savePlan(db, olive, { budgets: [draft(ids.groceries)], removed: [] });
    const progress = await budgetProgress(db, stranger, view);
    expect(progress.lines).toEqual([]);
    expect(progress.total).toEqual({ planned: 0, spent: 0, expected: 0 });
  });
});
