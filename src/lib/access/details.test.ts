import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
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
  users,
} from "@/lib/db/schema";
import { addStartingCategories, spentByCategory } from "@/lib/sorting/categories";
import {
  activityPage,
  addTag,
  categoriseTransaction,
  categoryOverview,
  changeRule,
  dailySpending,
  removeSplit,
  removeTag,
  ruleList,
  saveNote,
  splitProblem,
  splitTransaction,
  tagChoices,
  type Viewer,
} from ".";

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
const TODAY = "2026-10-10";

let db: Db;
let close: () => Promise<void>;
let category: Record<string, string>;
let away: Record<string, string>;
let row: Record<string, string>;

const at = (accountId: string, date: string, amountCents: number, descriptionRaw: string) => ({
  householdId: ids.home,
  accountId,
  date,
  amountCents,
  descriptionRaw,
  source: "file" as const,
});

/** What the screens add up: spending by category, what's unsorted, and spending by day. */
async function totals(viewer: Viewer) {
  const overview = await categoryOverview(db, viewer, TODAY);
  const by = Object.fromEntries(overview.categories.map((c) => [c.name, c.cents]));
  const spending = overview.categories.filter((c) => c.kind === "spending");
  const days = await dailySpending(db, viewer, "household", { from: "2026-10-01", to: TODAY });
  return {
    by,
    spent: spending.reduce((sum, c) => sum + c.cents, 0) + overview.unsorted.cents,
    unsorted: overview.unsorted.cents,
    days: days.days.reduce((sum, d) => sum + d.cents, 0),
  };
}

async function rowOf(viewer: Viewer, id: string, search?: string) {
  const page = await activityPage(db, viewer, "household", { search });
  return page.rows.find((r) => r.id === id);
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
      id: ids.patPrivate,
      householdId: ids.home,
      ownerMemberId: ids.pat,
      name: "Pat's",
      visibility: "private",
    },
  ]);
  await addStartingCategories(db, ids.home);
  await addStartingCategories(db, ids.away);
  const names = async (householdId: string) =>
    Object.fromEntries(
      (await db.select().from(categories).where(eq(categories.householdId, householdId))).map(
        (c) => [c.name, c.id],
      ),
    );
  category = await names(ids.home);
  away = await names(ids.away);

  const inserted = await db
    .insert(transactions)
    .values([
      at(ids.everyday, "2026-10-09", -64_00, "KMART 1077 BROADWAY"),
      at(ids.everyday, "2026-10-08", -42_10, "WOOLWORTHS 1187 SURRY HILLS"),
      { ...at(ids.everyday, "2026-10-09", -12_00, "COFFEE CART"), pending: true },
      {
        ...at(ids.everyday, "2026-10-07", -500_00, "TRANSFER TO SAVINGS"),
        categoryId: category["Transfers"],
      },
      at(ids.everyday, "2026-10-06", 30_00, "KMART REFUND"),
      at(ids.everyday, "2026-10-05", -18_40, "SQ *BAR LUCA"),
      at(ids.patPrivate, "2026-10-08", -80_00, "FLORIST NEWTOWN"),
    ])
    .returning({ id: transactions.id, description: transactions.descriptionRaw });
  row = Object.fromEntries(inserted.map((r) => [r.description, r.id]));
});
afterAll(async () => close());

describe("splitting a transaction", () => {
  it("counts each part in its own category, and every total stays the same", async () => {
    const before = await totals(olive);
    expect(before.unsorted).toBe(64_00 + 42_10 + 12_00 + 18_40);

    const saved = await splitTransaction(db, olive, row["KMART 1077 BROADWAY"], [
      { categoryId: category["Shopping"], cents: 24_00 },
      { categoryId: category["Groceries"], cents: 40_00 },
    ]);
    expect(saved).toMatchObject({ ok: true, category: { name: "Groceries" } });
    if (!saved.ok) return;
    // Biggest first, in signed cents like the row.
    expect(saved.parts.map((p) => [p.category.name, p.cents])).toEqual([
      ["Groceries", -40_00],
      ["Shopping", -24_00],
    ]);

    const after = await totals(olive);
    expect(after.by["Groceries"]).toBe(40_00);
    expect(after.by["Shopping"]).toBe(24_00);
    expect(after.unsorted).toBe(before.unsorted - 64_00);
    expect(after.spent).toBe(before.spent);
    expect(after.days).toBe(before.days);
    const colours = await spentByCategory(db, ids.home);
    expect(colours.get(category["Groceries"])).toBe(40_00);
    expect(colours.get(category["Shopping"])).toBe(24_00);

    // The bank's row is left as it came, and the list shows its parts.
    const kmart = await rowOf(olive, row["KMART 1077 BROADWAY"]);
    expect(kmart).toMatchObject({ amountCents: -64_00, category: { name: "Groceries" } });
    expect(kmart?.parts.map((p) => p.category.name)).toEqual(["Groceries", "Shopping"]);
  });

  it("replaces a split, and saving the same one twice changes nothing", async () => {
    const parts = [
      { categoryId: category["Groceries"], cents: 30_00 },
      { categoryId: category["Shopping"], cents: 20_00 },
      { categoryId: category["Health"], cents: 14_00 },
    ];
    await splitTransaction(db, olive, row["KMART 1077 BROADWAY"], parts);
    await splitTransaction(db, olive, row["KMART 1077 BROADWAY"], parts);
    const saved = await db
      .select()
      .from(splits)
      .where(eq(splits.transactionId, row["KMART 1077 BROADWAY"]));
    expect(saved.map((p) => p.amountCents).sort()).toEqual([-30_00, -20_00, -14_00].sort());
    expect((await totals(olive)).by["Health"]).toBe(14_00);
  });

  it("splits money in into money-in parts", async () => {
    const saved = await splitTransaction(db, olive, row["KMART REFUND"], [
      { categoryId: category["Shopping"], cents: 20_00 },
      { categoryId: category["Income"], cents: 10_00 },
    ]);
    expect(saved.ok && saved.parts.map((p) => p.cents)).toEqual([20_00, 10_00]);
    expect((await totals(olive)).by["Income"]).toBe(10_00);
  });

  it("says why a split can't be saved", async () => {
    expect(splitProblem(-64_00, [{ categoryId: "a", cents: 64_00 }])).toBe(
      "A split needs at least two parts.",
    );
    const seven = Array.from({ length: 7 }, (_, i) => ({ categoryId: `${i}`, cents: 1 }));
    expect(splitProblem(-7, seven)).toBe("A split can have up to 6 parts.");
    expect(
      splitProblem(-64_00, [
        { categoryId: "a", cents: 64_00 },
        { categoryId: "b", cents: 0 },
      ]),
    ).toBe("Give every part an amount, or remove it.");
    expect(
      splitProblem(-64_00, [
        { categoryId: "a", cents: 32_00 },
        { categoryId: "a", cents: 32_00 },
      ]),
    ).toBe("Each part needs its own category.");
    expect(
      splitProblem(-64_00, [
        { categoryId: "a", cents: 40_00 },
        { categoryId: "b", cents: 20_00 },
      ]),
    ).toBe("The parts add up to $60.00, but the payment is $64.00.");
    expect(
      splitProblem(-64_00, [
        { categoryId: "a", cents: 40.5 },
        { categoryId: "b", cents: 23.5 },
      ]),
    ).toBe("Give every part an amount, or remove it.");
  });

  it("refuses pending rows, transfers, other households' categories and strangers", async () => {
    const half = (a: string, b: string, cents: number) => [
      { categoryId: a, cents: cents / 2 },
      { categoryId: b, cents: cents / 2 },
    ];
    expect(
      await splitTransaction(
        db,
        olive,
        row["COFFEE CART"],
        half(category["Groceries"], category["Shopping"], 12_00),
      ),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/still pending/) });
    expect(
      await splitTransaction(
        db,
        olive,
        row["TRANSFER TO SAVINGS"],
        half(category["Groceries"], category["Shopping"], 500_00),
      ),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/Transfers aren't counted/) });
    const woolies = row["WOOLWORTHS 1187 SURRY HILLS"];
    expect(
      await splitTransaction(db, olive, woolies, [
        { categoryId: category["Groceries"], cents: 21_05 },
        { categoryId: category["Transfers"], cents: 21_05 },
      ]),
    ).toMatchObject({ ok: false, error: "Pick a spending or income category for each part." });
    expect(
      await splitTransaction(db, olive, woolies, [
        { categoryId: category["Groceries"], cents: 21_05 },
        { categoryId: away["Shopping"], cents: 21_05 },
      ]),
    ).toMatchObject({ ok: false, error: "That category isn't in your household." });
    expect(
      await splitTransaction(db, zed, woolies, half(away["Groceries"], away["Shopping"], 42_10)),
    ).toMatchObject({ ok: false, error: "That transaction isn't one you can change." });
    expect(
      await splitTransaction(
        db,
        olive,
        row["FLORIST NEWTOWN"],
        half(category["Gifts"], category["Shopping"], 80_00),
      ),
    ).toMatchObject({ ok: false, error: "That transaction isn't one you can change." });
    expect(await db.select().from(splits).where(eq(splits.transactionId, woolies))).toEqual([]);
  });

  it("takes a split away, keeping its biggest part's category", async () => {
    expect(await removeSplit(db, olive, row["KMART 1077 BROADWAY"])).toMatchObject({
      ok: true,
      category: { name: "Groceries" },
    });
    const kmart = await rowOf(olive, row["KMART 1077 BROADWAY"]);
    expect(kmart).toMatchObject({ parts: [], category: { name: "Groceries" } });
    expect((await totals(olive)).by["Groceries"]).toBe(64_00);
    expect(await removeSplit(db, zed, row["KMART 1077 BROADWAY"])).toMatchObject({ ok: false });
  });

  it("picking one category for a split row replaces the split", async () => {
    await splitTransaction(db, olive, row["SQ *BAR LUCA"], [
      { categoryId: category["Eating out"], cents: 10_00 },
      { categoryId: category["Entertainment"], cents: 8_40 },
    ]);
    const picked = await categoriseTransaction(
      db,
      olive,
      row["SQ *BAR LUCA"],
      category["Entertainment"],
    );
    expect(picked).toMatchObject({ ok: true, category: { name: "Entertainment" } });
    expect(
      await db.select().from(splits).where(eq(splits.transactionId, row["SQ *BAR LUCA"])),
    ).toEqual([]);
    expect((await totals(olive)).by["Entertainment"]).toBe(18_40);
  });
});

describe("tags", () => {
  it("adds a tag by name, making it once and reusing it whatever its capitals", async () => {
    const first = await addTag(db, olive, row["KMART 1077 BROADWAY"], "  Bali   2027 ");
    expect(first).toMatchObject({ ok: true, tags: [{ name: "Bali 2027" }] });
    const second = await addTag(db, olive, row["WOOLWORTHS 1187 SURRY HILLS"], "bali 2027");
    expect(second.ok && second.tags[0].id).toBe(first.ok && first.tags[0].id);
    // Twice is the same as once, and tags come in name order.
    await addTag(db, olive, row["KMART 1077 BROADWAY"], "Bali 2027");
    const both = await addTag(db, olive, row["KMART 1077 BROADWAY"], "Abbie's birthday");
    expect(both.ok && both.tags.map((t) => t.name)).toEqual(["Abbie's birthday", "Bali 2027"]);
    expect(await db.select().from(tags).where(eq(tags.householdId, ids.home))).toHaveLength(2);
    // Search finds a row by its tag.
    expect(await rowOf(olive, row["KMART 1077 BROADWAY"], "bali")).toBeDefined();
  });

  it("takes a tag off one transaction only", async () => {
    const bali = (await rowOf(olive, row["KMART 1077 BROADWAY"]))!.tags.find(
      (t) => t.name === "Bali 2027",
    )!;
    expect(await removeTag(db, olive, row["KMART 1077 BROADWAY"], bali.id)).toMatchObject({
      ok: true,
      tags: [{ name: "Abbie's birthday" }],
    });
    expect((await rowOf(olive, row["WOOLWORTHS 1187 SURRY HILLS"]))?.tags).toEqual([bali]);
  });

  it("refuses an empty or long name, too many tags, and strangers", async () => {
    const kmart = row["KMART 1077 BROADWAY"];
    expect(await addTag(db, olive, kmart, "   ")).toMatchObject({ ok: false });
    expect(await addTag(db, olive, kmart, "x".repeat(31))).toMatchObject({
      ok: false,
      error: "Keep a tag to 30 characters.",
    });
    expect(await addTag(db, zed, kmart, "Mine now")).toMatchObject({ ok: false });
    expect(await addTag(db, olive, row["FLORIST NEWTOWN"], "Peek")).toMatchObject({ ok: false });
    for (let i = 1; i <= 7; i++) await addTag(db, olive, kmart, `Tag ${i}`);
    expect(await addTag(db, olive, kmart, "One more")).toMatchObject({
      ok: false,
      error: "A transaction can have up to 8 tags.",
    });
  });

  it("offers the tags each person can see, most used first", async () => {
    await addTag(db, pat, row["FLORIST NEWTOWN"], "Surprise for Olive");
    const forOlive = (await tagChoices(db, olive)).map((t) => t.name);
    expect(forOlive[0]).toBe("Abbie's birthday");
    expect(forOlive).not.toContain("Surprise for Olive");
    expect((await tagChoices(db, pat)).map((t) => t.name)).toContain("Surprise for Olive");
    expect(await tagChoices(db, zed)).toEqual([]);
  });

  it("lets a rule add a tag, by name, and take it off again", async () => {
    const [shop] = await db
      .insert(merchants)
      .values({ householdId: ids.home, matchText: "KMART", displayName: "Kmart" })
      .returning();
    await db
      .update(transactions)
      .set({ merchantId: shop.id })
      .where(eq(transactions.id, row["KMART 1077 BROADWAY"]));
    const [rule] = await db
      .insert(rules)
      .values({ householdId: ids.home, merchantId: shop.id, categoryId: category["Shopping"] })
      .returning();
    expect(await changeRule(db, olive, rule.id, { tag: "bali 2027" })).toEqual({ ok: true });
    const [listed] = await ruleList(db, olive);
    expect(listed.tag).toMatchObject({ name: "Bali 2027" });
    expect(await changeRule(db, olive, rule.id, { tag: "x".repeat(31) })).toMatchObject({
      ok: false,
    });
    expect(await changeRule(db, olive, rule.id, { tag: "" })).toEqual({ ok: true });
    expect((await ruleList(db, olive))[0].tag).toBeNull();
  });
});

describe("notes", () => {
  it("saves a short note, finds the row by it, and takes it away when empty", async () => {
    const id = row["WOOLWORTHS 1187 SURRY HILLS"];
    expect(await saveNote(db, olive, id, "  Party   food for Saturday ")).toEqual({
      ok: true,
      note: "Party food for Saturday",
    });
    expect((await rowOf(olive, id, "party food"))?.note).toBe("Party food for Saturday");
    expect(await saveNote(db, olive, id, "x".repeat(201))).toMatchObject({
      ok: false,
      error: "Keep a note to 200 characters.",
    });
    expect(await saveNote(db, zed, id, "Hello")).toMatchObject({ ok: false });
    expect(await saveNote(db, olive, id, "   ")).toEqual({ ok: true, note: null });
    expect((await rowOf(olive, id))?.note).toBeNull();
  });
});
