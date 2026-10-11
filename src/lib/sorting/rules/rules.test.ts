import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../tests/db";
import { categoriseTransaction, sortShopAlways, type Viewer } from "@/lib/access";
import { checkImport, runImport } from "@/lib/banks/imports";
import type { Db } from "@/lib/db";
import {
  accounts,
  categories,
  households,
  members,
  merchants,
  rules,
  splits,
  tags,
  transactions,
  transactionTags,
  users,
} from "@/lib/db/schema";
import { addStartingCategories } from "../categories";
import { activeRules, ruleFor, type ActiveRule } from ".";

const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  away: "00000000-0000-4000-8000-000000000002",
  olive: "00000000-0000-4000-8000-0000000000a1",
  pat: "00000000-0000-4000-8000-0000000000a2",
  zed: "00000000-0000-4000-8000-0000000000a3",
  everyday: "00000000-0000-4000-8000-000000000b01",
  patPrivate: "00000000-0000-4000-8000-000000000b02",
};
const olive: Viewer = { memberId: ids.olive, householdId: ids.home };
const pat: Viewer = { memberId: ids.pat, householdId: ids.home };
const zed: Viewer = { memberId: ids.zed, householdId: ids.away };

/** A made-up bank CSV in the date, amount, description shape, newest first. */
const csv = (rows: [date: string, amount: string, description: string][]) => ({
  target: { accountId: ids.everyday },
  filename: "statement.csv",
  bytes: new TextEncoder().encode(rows.map((row) => row.map((v) => `"${v}"`).join(",")).join("\n")),
});
const NOW = new Date("2026-09-20T02:00:00Z");

let db: Db;
let close: () => Promise<void>;
let category: Record<string, string>;

const rowsLike = (text: string) =>
  db
    .select({
      id: transactions.id,
      description: transactions.descriptionRaw,
      accountId: transactions.accountId,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(eq(transactions.descriptionRaw, text));
const one = async (text: string) => (await rowsLike(text))[0];
const shopOf = async (name: string) =>
  (
    await db
      .select()
      .from(merchants)
      .where(and(eq(merchants.householdId, ids.home), eq(merchants.displayName, name)))
  )[0];

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
});
afterAll(async () => close());

describe("rules", () => {
  it("sorts the next import from a shop once someone says yes, always", async () => {
    const first = await runImport(
      db,
      olive,
      csv([
        ["03/09/2026", "-31.60", "WOOLWORTHS 1187 SURRY HILLS AU"],
        ["02/09/2026", "-8.40", "WOOLWORTHS METRO 2231"],
        ["01/09/2026", "-12.00", "SQ *BAR LUCA"],
      ]),
      NOW,
    );
    expect(first.ok).toBe(true);
    const picked = await one("WOOLWORTHS 1187 SURRY HILLS AU");
    const result = await categoriseTransaction(db, olive, picked.id, category["Groceries"]);
    expect(result).toMatchObject({
      ok: true,
      category: { name: "Groceries", kind: "spending" },
      shop: { name: "Woolworths" },
      earlier: 1,
      ruled: false,
    });
    if (!result.ok || !result.shop) throw new Error("no shop");

    // Just the rule, not the earlier one.
    expect(await sortShopAlways(db, olive, result.shop.id, category["Groceries"], false)).toEqual({
      ok: true,
      category: expect.objectContaining({ name: "Groceries" }),
      changed: [],
      inCategory: 1,
    });
    expect((await one("WOOLWORTHS METRO 2231")).categoryId).toBeNull();

    // The check before importing already shows it sorted, and the import sorts it.
    const next = csv([
      ["05/09/2026", "-22.10", "EFTPOS PURCHASE WOOLWORTHS 0099 BONDI NSW"],
      ["05/09/2026", "-6.50", "SQ *BAR LUCA"],
    ]);
    const check = await checkImport(db, olive, next);
    if (!check.ok) throw new Error(check.error);
    expect(check.preview.map((row) => [row.name, row.category?.name ?? null])).toEqual([
      ["Woolworths", "Groceries"],
      ["Bar Luca", null],
    ]);
    expect((await runImport(db, olive, next, NOW)).ok).toBe(true);
    expect((await one("EFTPOS PURCHASE WOOLWORTHS 0099 BONDI NSW")).categoryId).toBe(
      category["Groceries"],
    );
    expect((await one("SQ *BAR LUCA")).categoryId).toBeNull();
    const [rule] = await db.select().from(rules).where(eq(rules.householdId, ids.home));
    expect(rule).toMatchObject({ merchantId: result.shop.id, appliedCount: 1, enabled: true });

    // Picking the same category again for the shop has nothing to ask.
    const again = await categoriseTransaction(
      db,
      olive,
      (await one("WOOLWORTHS METRO 2231")).id,
      category["Groceries"],
    );
    expect(again).toMatchObject({ ok: true, ruled: true, earlier: 0 });
  });

  it("changes exactly the shop's earlier rows the person can see", async () => {
    const add = (accountId: string, date: string, descriptionRaw: string, more: object = {}) => ({
      householdId: ids.home,
      accountId,
      date,
      amountCents: -2000,
      descriptionRaw,
      source: "file" as const,
      ...more,
    });
    const kmart = (
      await db
        .insert(merchants)
        .values({ householdId: ids.home, matchText: "KMART", displayName: "Kmart" })
        .returning()
    )[0];
    const coles = (
      await db
        .insert(merchants)
        .values({ householdId: ids.home, matchText: "COLES", displayName: "Coles" })
        .returning()
    )[0];
    const shop = { merchantId: kmart.id };
    await db.insert(transactions).values([
      add(ids.everyday, "2026-08-01", "KMART picked", shop),
      add(ids.everyday, "2026-08-02", "KMART no category", shop),
      add(ids.everyday, "2026-08-03", "KMART eating out", {
        ...shop,
        categoryId: category["Eating out"],
      }),
      add(ids.everyday, "2026-08-04", "KMART already shopping", {
        ...shop,
        categoryId: category["Shopping"],
      }),
      add(ids.everyday, "2026-08-05", "KMART transfer", {
        ...shop,
        transferGroupId: crypto.randomUUID(),
      }),
      add(ids.everyday, "2026-08-06", "KMART split", shop),
      add(ids.patPrivate, "2026-08-07", "KMART in Pat's private account", shop),
      add(ids.everyday, "2026-08-08", "COLES", { merchantId: coles.id }),
    ]);
    const split = await one("KMART split");
    await db.insert(splits).values([
      { transactionId: split.id, categoryId: category["Groceries"], amountCents: -1000 },
      { transactionId: split.id, categoryId: category["Shopping"], amountCents: -1000 },
    ]);

    const picked = await one("KMART picked");
    const asked = await categoriseTransaction(db, olive, picked.id, category["Shopping"]);
    // The row with no category and the one in Eating out. Not the split, the transfer, the one
    // already in Shopping, or Pat's private one, which Olive can't see.
    expect(asked).toMatchObject({ ok: true, shop: { id: kmart.id }, earlier: 2 });

    const sorted = await sortShopAlways(db, olive, kmart.id, category["Shopping"], true);
    if (!sorted.ok) throw new Error(sorted.error);
    const changed = sorted.changed;
    const byId = new Map(
      (await db.select().from(transactions)).map((row) => [row.id, row.descriptionRaw]),
    );
    expect(changed.map((id) => byId.get(id)).sort()).toEqual([
      "KMART eating out",
      "KMART no category",
    ]);
    expect(sorted.inCategory).toBe(4);
    expect((await one("KMART in Pat's private account")).categoryId).toBeNull();
    expect((await one("KMART transfer")).categoryId).toBeNull();
    expect((await one("KMART split")).categoryId).toBeNull();
    expect((await one("COLES")).categoryId).toBeNull();
    const [rule] = await db.select().from(rules).where(eq(rules.merchantId, kmart.id));
    expect(rule.appliedCount).toBe(2);
  });

  it("keeps one rule per shop, and moves it when the answer changes", async () => {
    const kmart = await shopOf("Kmart");
    await sortShopAlways(db, olive, kmart.id, category["Gifts"], false);
    await sortShopAlways(db, olive, kmart.id, category["Gifts"], false);
    const found = await db.select().from(rules).where(eq(rules.merchantId, kmart.id));
    expect(found).toHaveLength(1);
    expect(found[0].categoryId).toBe(category["Gifts"]);
  });

  it("only lets people change what they can see, into their own categories", async () => {
    const mine = await one("COLES");
    const patsRow = await one("KMART in Pat's private account");
    const [awayGroceries] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.householdId, ids.away), eq(categories.name, "Groceries")));
    expect(await categoriseTransaction(db, zed, mine.id, awayGroceries.id)).toEqual({
      ok: false,
      error: "That transaction isn't one you can change.",
    });
    expect(await categoriseTransaction(db, olive, mine.id, awayGroceries.id)).toEqual({
      ok: false,
      error: "That category isn't in your household.",
    });
    expect(await categoriseTransaction(db, olive, patsRow.id, category["Gifts"])).toEqual({
      ok: false,
      error: "That transaction isn't one you can change.",
    });
    // Pat can change their own private row.
    expect(await categoriseTransaction(db, pat, patsRow.id, category["Gifts"])).toMatchObject({
      ok: true,
    });
    // One category for a split row replaces its parts.
    const split = await one("KMART split");
    expect(await categoriseTransaction(db, olive, split.id, category["Gifts"])).toMatchObject({
      ok: true,
    });
    expect(await db.select().from(splits).where(eq(splits.transactionId, split.id))).toEqual([]);
    const kmart = await shopOf("Kmart");
    expect(await sortShopAlways(db, zed, kmart.id, awayGroceries.id, true)).toEqual({
      ok: false,
      error: "That shop isn't in your household.",
    });
    expect((await one("COLES")).categoryId).toBeNull();
  });

  it("adds a rule's tag to the rows it sorts", async () => {
    const [tag] = await db
      .insert(tags)
      .values({ householdId: ids.home, name: "Bali 2027" })
      .returning();
    await db.insert(rules).values({
      householdId: ids.home,
      matchText: "garuda",
      categoryId: category["Travel"],
      tagId: tag.id,
      position: 99,
    });
    expect(
      (await runImport(db, olive, csv([["06/09/2026", "-640.00", "GARUDA INDONESIA 8812"]]), NOW))
        .ok,
    ).toBe(true);
    const row = await one("GARUDA INDONESIA 8812");
    expect(row.categoryId).toBe(category["Travel"]);
    expect(
      await db.select().from(transactionTags).where(eq(transactionTags.transactionId, row.id)),
    ).toEqual([{ transactionId: row.id, tagId: tag.id }]);
  });
});

describe("matching a rule", () => {
  const rule = (id: string, more: Partial<ActiveRule>): ActiveRule => ({
    id,
    merchantId: null,
    matchText: null,
    category: { id: `c-${id}`, name: id, kind: "spending", icon: null, colourSlot: null },
    tag: null,
    ...more,
  });
  const row = (description: string, merchantId?: string) => ({
    accountId: "a",
    date: "2026-09-01",
    amountCents: -100,
    description,
    merchant: merchantId ? { id: merchantId, name: "Shop" } : undefined,
  });

  it("takes the first rule that matches the shop or whole words of the bank text", () => {
    const list = [rule("shop", { merchantId: "m1" }), rule("text", { matchText: "SALARY" })];
    expect(ruleFor(list, row("ANYTHING", "m1"))?.id).toBe("shop");
    expect(ruleFor(list, row("ACME PTY LTD salary", "m2"))?.id).toBe("text");
    expect(ruleFor(list, row("SALARYSACRIFICE"))).toBeNull();
    expect(ruleFor(list, row("NOTHING HERE"))).toBeNull();
  });

  it("leaves out rules that are off, or whose category is archived", async () => {
    await db
      .update(categories)
      .set({ archived: true })
      .where(eq(categories.id, category["Travel"]));
    const active = await activeRules(db, ids.home);
    expect(active.some((r) => r.category.id === category["Travel"])).toBe(false);
    await db.update(rules).set({ enabled: false });
    expect(await activeRules(db, ids.home)).toEqual([]);
  });
});
