import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import type { Db } from "@/lib/db";
import {
  accounts,
  budgets,
  categories,
  households,
  members,
  merchants,
  rules,
  splits,
  transactions,
  users,
} from "@/lib/db/schema";
import { addStartingCategories } from "@/lib/sorting/categories";
import { renameShop } from "@/lib/sorting/merchants";
import {
  addCategory,
  categoryOverview,
  changeRule,
  dailySpending,
  dayOfMonth,
  deleteCategory,
  deleteRule,
  editCategory,
  mergeCategory,
  ruleList,
  shopList,
  type Viewer,
} from ".";

const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  away: "00000000-0000-4000-8000-000000000002",
  olive: "00000000-0000-4000-8000-0000000000a1",
  pat: "00000000-0000-4000-8000-0000000000a2",
  zed: "00000000-0000-4000-8000-0000000000a3",
  everyday: "00000000-0000-4000-8000-000000000b01",
  savings: "00000000-0000-4000-8000-000000000b02",
  patPrivate: "00000000-0000-4000-8000-000000000b03",
};
const olive: Viewer = { memberId: ids.olive, householdId: ids.home };
const pat: Viewer = { memberId: ids.pat, householdId: ids.home };
const zed: Viewer = { memberId: ids.zed, householdId: ids.away };
const TODAY = "2026-10-10";

let db: Db;
let close: () => Promise<void>;
let category: Record<string, string>;
let shop: Record<string, string>;

const row = (
  accountId: string,
  date: string,
  amountCents: number,
  descriptionRaw: string,
  more: Partial<typeof transactions.$inferInsert> = {},
) => ({
  householdId: ids.home,
  accountId,
  date,
  amountCents,
  descriptionRaw,
  source: "file" as const,
  ...more,
});

const summary = async (viewer: Viewer, name: string) =>
  (await categoryOverview(db, viewer, TODAY)).categories.find((c) => c.name === name);

/** Every number the screens show: spending by category and day, what's unsorted, and income. */
async function totals(viewer: Viewer) {
  const overview = await categoryOverview(db, viewer, TODAY);
  const spending = overview.categories.filter((c) => c.kind === "spending");
  const days = await dailySpending(db, viewer, "household", { from: "2026-01-01", to: TODAY });
  return {
    spent: spending.reduce((sum, c) => sum + c.cents, 0) + overview.unsorted.cents,
    months: overview.monthStarts.map((_, i) => spending.reduce((sum, c) => sum + c.months[i], 0)),
    income: overview.categories
      .filter((c) => c.kind === "income")
      .reduce((sum, c) => sum + c.cents, 0),
    days: days.days.reduce((sum, d) => sum + d.cents, 0),
  };
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(households).values([
    { id: ids.home, name: "Home" },
    { id: ids.away, name: "Away" },
  ]);
  const [o, p, z] = await db
    .insert(users)
    .values([
      { name: "Olive", email: "olive@example.com" },
      { name: "Pat", email: "pat@example.com" },
      { name: "Zed", email: "zed@example.com" },
    ])
    .returning();
  await db.insert(members).values([
    { id: ids.olive, householdId: ids.home, userId: o.id, role: "owner", displayName: "Olive" },
    { id: ids.pat, householdId: ids.home, userId: p.id, role: "partner", displayName: "Pat" },
    { id: ids.zed, householdId: ids.away, userId: z.id, role: "owner", displayName: "Zed" },
  ]);
  await db.insert(accounts).values([
    {
      id: ids.everyday,
      householdId: ids.home,
      ownerMemberId: ids.olive,
      name: "Everyday",
      visibility: "shared",
    },
    {
      id: ids.savings,
      householdId: ids.home,
      ownerMemberId: ids.olive,
      name: "Savings",
      kind: "savings",
      visibility: "shared",
    },
    {
      id: ids.patPrivate,
      householdId: ids.home,
      ownerMemberId: ids.pat,
      name: "Pat's",
      visibility: "private",
    },
  ]);
  await addStartingCategories(db, ids.home);
  await addStartingCategories(db, ids.away);
  const list = await db.select().from(categories).where(eq(categories.householdId, ids.home));
  category = Object.fromEntries(list.map((c) => [c.name, c.id]));
  const shops = await db
    .insert(merchants)
    .values([
      { householdId: ids.home, matchText: "WOOLWORTHS", displayName: "Woolworths" },
      { householdId: ids.home, matchText: "BAR LUCA", displayName: "Bar Luca" },
      { householdId: ids.home, matchText: "UBER EATS", displayName: "Uber Eats" },
      { householdId: ids.home, matchText: "CHEMIST WAREHOUSE", displayName: "Chemist Warehouse" },
    ])
    .returning();
  shop = Object.fromEntries(shops.map((s) => [s.displayName, s.id]));

  const group = "00000000-0000-4000-8000-00000000c001";
  const inserted = await db
    .insert(transactions)
    .values([
      // October so far.
      row(ids.everyday, "2026-10-02", -42_10, "WOOLWORTHS 1187 SURRY HILLS AU", {
        merchantId: shop["Woolworths"],
        categoryId: category["Groceries"],
      }),
      row(ids.everyday, "2026-10-03", -18_40, "SQ *BAR LUCA", {
        merchantId: shop["Bar Luca"],
        categoryId: category["Eating out"],
      }),
      row(ids.everyday, "2026-10-04", -26_00, "UBER *EATS HELP.UBER.COM", {
        merchantId: shop["Uber Eats"],
        categoryId: category["Eating out"],
      }),
      row(ids.everyday, "2026-10-05", 5_00, "UBER *EATS REFUND", {
        merchantId: shop["Uber Eats"],
        categoryId: category["Eating out"],
      }),
      row(ids.everyday, "2026-10-05", -60_00, "KMART 1043 BONDI"),
      row(ids.everyday, "2026-10-06", 3_260_00, "SALARY ACME PTY LTD", {
        categoryId: category["Income"],
      }),
      row(ids.everyday, "2026-10-07", -500_00, "TRANSFER TO SAVINGS", {
        categoryId: category["Transfers"],
        transferGroupId: group,
      }),
      row(ids.savings, "2026-10-07", 500_00, "TRANSFER FROM EVERYDAY", {
        categoryId: category["Transfers"],
        transferGroupId: group,
      }),
      // A split: half groceries, half eating out.
      row(ids.everyday, "2026-10-08", -100_00, "COSTCO 0012"),
      // Pat's private spending stays Pat's.
      row(ids.patPrivate, "2026-10-08", -33_00, "CHEMIST WAREHOUSE 221", {
        merchantId: shop["Chemist Warehouse"],
        categoryId: category["Eating out"],
      }),
      // Earlier months.
      row(ids.everyday, "2026-08-14", -80_00, "SQ *BAR LUCA", {
        merchantId: shop["Bar Luca"],
        categoryId: category["Eating out"],
      }),
      row(ids.everyday, "2026-09-14", -120_00, "SQ *BAR LUCA", {
        merchantId: shop["Bar Luca"],
        categoryId: category["Eating out"],
      }),
      row(ids.everyday, "2026-09-20", -90_00, "WOOLWORTHS METRO 2231", {
        merchantId: shop["Woolworths"],
        categoryId: category["Groceries"],
      }),
    ])
    .returning({ id: transactions.id, description: transactions.descriptionRaw });
  const costco = inserted.find((t) => t.description === "COSTCO 0012")!;
  await db.insert(splits).values([
    { transactionId: costco.id, categoryId: category["Groceries"], amountCents: -60_00 },
    { transactionId: costco.id, categoryId: category["Eating out"], amountCents: -40_00 },
  ]);
  await db.insert(rules).values([
    {
      householdId: ids.home,
      merchantId: shop["Bar Luca"],
      categoryId: category["Eating out"],
      appliedCount: 3,
    },
    {
      householdId: ids.home,
      merchantId: shop["Woolworths"],
      categoryId: category["Groceries"],
      appliedCount: 1,
    },
    {
      householdId: ids.home,
      merchantId: shop["Chemist Warehouse"],
      categoryId: category["Eating out"],
      appliedCount: 1,
    },
  ]);
});
afterAll(async () => close());

describe("category overview", () => {
  it("adds up this month by category, split parts included, transfers and Pat's private rows out", async () => {
    const overview = await categoryOverview(db, olive, TODAY);
    expect(overview.from).toBe("2026-10-01");
    expect(overview.monthStarts).toEqual([
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
    ]);
    const get = (name: string) => overview.categories.find((c) => c.name === name)!;
    // Money out only: the $5 refund doesn't take anything off.
    expect(get("Eating out")).toMatchObject({ cents: 18_40 + 26_00 + 40_00, count: 4, rules: 2 });
    expect(get("Groceries")).toMatchObject({ cents: 42_10 + 60_00, count: 2, rules: 1 });
    expect(get("Income")).toMatchObject({ cents: 3_260_00, count: 1 });
    expect(get("Transfers")).toMatchObject({ cents: 500_00, count: 2 });
    expect(overview.unsorted).toEqual({ cents: 60_00, count: 1 });
    // The last six whole months, and "usually" over the two since money first came in.
    expect(get("Eating out").months).toEqual([0, 0, 0, 0, 80_00, 120_00]);
    expect(get("Eating out").usual).toBe(100_00);
    expect(get("Eating out").everCount).toBe(6);
    expect(get("Groceries").usual).toBe(45_00);
  });

  it("counts only what each person can see", async () => {
    expect(await summary(pat, "Eating out")).toMatchObject({
      cents: 18_40 + 26_00 + 40_00 + 33_00,
    });
    expect(
      (await categoryOverview(db, zed, TODAY)).categories.find((c) => c.name === "Eating out"),
    ).toMatchObject({ cents: 0 });
  });

  it("knows how far through the month today is", () => {
    expect(dayOfMonth("2026-10-10")).toEqual({ day: 10, of: 31 });
    expect(dayOfMonth("2026-02-28")).toEqual({ day: 28, of: 28 });
  });
});

describe("changing categories", () => {
  it("adds a category at the end, with a name no other category has", async () => {
    const added = await addCategory(db, olive, "  Pets  ");
    expect(added).toMatchObject({ ok: true });
    const [pets] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.householdId, ids.home), eq(categories.name, "Pets")));
    expect(pets).toMatchObject({ kind: "spending", icon: "tag", colourSlot: null, sortOrder: 16 });
    expect(await addCategory(db, olive, "groceries")).toEqual({
      ok: false,
      error: "There's already a category called groceries.",
    });
    expect(await addCategory(db, olive, "   ")).toMatchObject({ ok: false });
    expect(await addCategory(db, olive, "x".repeat(41))).toMatchObject({ ok: false });
    expect(await addCategory(db, zed, "Groceries")).toMatchObject({ ok: false });
  });

  it("renames a category and sets whether it counts toward budgets", async () => {
    const id = category["Gifts"];
    expect(
      await editCategory(db, olive, id, { name: "Presents", countsTowardBudgets: false }),
    ).toEqual({
      ok: true,
      id,
    });
    expect(await summary(olive, "Presents")).toMatchObject({ countsTowardBudgets: false });
    expect(
      await editCategory(db, olive, id, { name: "presents", countsTowardBudgets: true }),
    ).toMatchObject({ ok: true });
    expect(
      await editCategory(db, olive, id, { name: "Health", countsTowardBudgets: true }),
    ).toMatchObject({
      ok: false,
    });
    expect(await editCategory(db, zed, id, { name: "Mine", countsTowardBudgets: true })).toEqual({
      ok: false,
      error: "That category isn't in your household.",
    });
    // Income never counts toward budgets, whatever's sent.
    await editCategory(db, olive, category["Income"], {
      name: "Income",
      countsTowardBudgets: false,
    });
    expect(await summary(olive, "Income")).toMatchObject({ countsTowardBudgets: true });
  });

  it("merges a category without changing a single total", async () => {
    const budget = { householdId: ids.home, ownerMemberId: ids.olive, period: "monthly" as const };
    await db.insert(budgets).values([
      { ...budget, categoryId: category["Eating out"], amountCents: 400_00 },
      { ...budget, categoryId: category["Groceries"], amountCents: 800_00 },
      {
        ...budget,
        ownerMemberId: ids.pat,
        categoryId: category["Eating out"],
        amountCents: 150_00,
      },
    ]);
    const beforeOlive = await totals(olive);
    const beforePat = await totals(pat);
    const eating = (await summary(olive, "Eating out"))!;
    const groceries = (await summary(olive, "Groceries"))!;

    expect(await mergeCategory(db, olive, category["Eating out"], category["Groceries"])).toEqual({
      ok: true,
      id: category["Groceries"],
    });

    expect(await totals(olive)).toEqual(beforeOlive);
    expect(await totals(pat)).toEqual(beforePat);
    const merged = (await summary(olive, "Groceries"))!;
    expect(merged.cents).toBe(eating.cents + groceries.cents);
    expect(merged.months).toEqual(eating.months.map((m, i) => m + groceries.months[i]));
    expect(await summary(olive, "Eating out")).toBeUndefined();

    // Pat's private row moved too, and the split part.
    const [chemist] = await db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(eq(transactions.descriptionRaw, "CHEMIST WAREHOUSE 221"));
    expect(chemist.categoryId).toBe(category["Groceries"]);
    const parts = await db.select().from(splits);
    expect(parts.map((p) => p.categoryId)).toEqual([category["Groceries"], category["Groceries"]]);

    // Its rules move, the ones for shops Olive can't see too.
    const moved = await db.select().from(rules).where(eq(rules.categoryId, category["Groceries"]));
    expect(moved.map((r) => r.merchantId).sort()).toEqual(
      [shop["Bar Luca"], shop["Woolworths"], shop["Chemist Warehouse"]].sort(),
    );
    // Olive's budgets add up into one; Pat's moves.
    const left = await db.select().from(budgets).where(eq(budgets.householdId, ids.home));
    expect(left.map((b) => [b.ownerMemberId, b.categoryId, b.amountCents]).sort()).toEqual(
      [
        [ids.olive, category["Groceries"], 1_200_00],
        [ids.pat, category["Groceries"], 150_00],
      ].sort(),
    );
  });

  it("merges an empty category too", async () => {
    const before = await totals(olive);
    expect(await mergeCategory(db, olive, category["Health"], category["Groceries"])).toMatchObject(
      {
        ok: true,
      },
    );
    expect(await summary(olive, "Health")).toBeUndefined();
    expect(await totals(olive)).toEqual(before);
  });

  it("only merges spending categories, within the household", async () => {
    expect(
      await mergeCategory(db, olive, category["Transfers"], category["Groceries"]),
    ).toMatchObject({
      ok: false,
    });
    expect(
      await mergeCategory(db, olive, category["Groceries"], category["Groceries"]),
    ).toMatchObject({
      ok: false,
    });
    expect(await mergeCategory(db, zed, category["Shopping"], category["Groceries"])).toMatchObject(
      {
        ok: false,
      },
    );
  });

  it("deletes a category only when nothing is in it, even rows the person can't see", async () => {
    const before = await totals(olive);
    // Pat's private row is the only thing in Insurance.
    await db
      .update(transactions)
      .set({ categoryId: category["Insurance"] })
      .where(eq(transactions.descriptionRaw, "CHEMIST WAREHOUSE 221"));
    expect(await deleteCategory(db, olive, category["Insurance"])).toEqual({
      ok: false,
      error: "Insurance still has transactions in it. Merge it into another category instead.",
    });
    expect(await deleteCategory(db, olive, category["Groceries"])).toMatchObject({ ok: false });
    expect(await deleteCategory(db, olive, category["Income"])).toMatchObject({ ok: false });

    await db.insert(rules).values({
      householdId: ids.home,
      merchantId: shop["Uber Eats"],
      categoryId: category["Entertainment"],
    });
    expect(await deleteCategory(db, olive, category["Entertainment"])).toEqual({
      ok: true,
      id: category["Entertainment"],
    });
    expect(await db.select().from(rules).where(eq(rules.merchantId, shop["Uber Eats"]))).toEqual(
      [],
    );
    expect(await totals(olive)).toEqual(before);
    expect(await deleteCategory(db, zed, category["Shopping"])).toMatchObject({ ok: false });
  });
});

describe("rules and shop names", () => {
  it("lists rules busiest first, leaving out shops only in a partner's private account", async () => {
    const list = await ruleList(db, olive);
    expect(list.map((r) => [r.shop?.name, r.category.name, r.sorted])).toEqual([
      ["Bar Luca", "Groceries", 3],
      ["Woolworths", "Groceries", 1],
    ]);
    const patSees = await ruleList(db, pat);
    expect(patSees.map((r) => r.shop?.name)).toContain("Chemist Warehouse");
    expect(await ruleList(db, zed)).toEqual([]);
  });

  it("turns a rule off and on, changes its category, and deletes it", async () => {
    const [rule] = await ruleList(db, olive);
    expect(await changeRule(db, olive, rule.id, { enabled: false })).toEqual({ ok: true });
    expect((await ruleList(db, olive))[0]).toMatchObject({ id: rule.id, enabled: false });
    expect(await changeRule(db, olive, rule.id, { categoryId: category["Shopping"] })).toEqual({
      ok: true,
    });
    expect((await ruleList(db, olive)).find((r) => r.id === rule.id)).toMatchObject({
      enabled: false,
      category: { name: "Shopping" },
    });
    const awayCategory = (
      await db.select().from(categories).where(eq(categories.householdId, ids.away))
    )[0];
    expect(await changeRule(db, olive, rule.id, { categoryId: awayCategory.id })).toMatchObject({
      ok: false,
    });
    expect(await changeRule(db, zed, rule.id, { enabled: true })).toMatchObject({ ok: false });
    expect(await deleteRule(db, zed, rule.id)).toMatchObject({ ok: false });
    expect(await deleteRule(db, olive, rule.id)).toEqual({ ok: true });
    expect((await ruleList(db, olive)).map((r) => r.id)).not.toContain(rule.id);
  });

  it("lists the shops each person has seen, with the newest bank text and any rule", async () => {
    await renameShop(db, olive, shop["Bar Luca"], "Luca");
    const list = await shopList(db, olive);
    expect(
      list.map((s) => [s.name, s.bankText, s.seen, s.lastSeen, s.renamed, s.rule?.name ?? null]),
    ).toEqual([
      ["Luca", "SQ *BAR LUCA", 3, "2026-10-03", true, null],
      ["Uber Eats", "UBER *EATS REFUND", 2, "2026-10-05", false, null],
      ["Woolworths", "WOOLWORTHS 1187 SURRY HILLS AU", 2, "2026-10-02", false, "Groceries"],
    ]);
    expect((await shopList(db, pat)).map((s) => s.name)).toContain("Chemist Warehouse");
    expect(await shopList(db, zed)).toEqual([]);
  });
});
