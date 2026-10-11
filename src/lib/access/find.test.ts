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
  savedViews,
  splits,
  tags,
  transactions,
  transactionTags,
  users,
} from "@/lib/db/schema";
import { addStartingCategories } from "@/lib/sorting/categories";
import {
  activityPage,
  ANYTHING,
  cleanFind,
  countActivity,
  findFilters,
  knownFind,
  rangeDays,
  removeView,
  savedViewList,
  saveView,
  type ActivityFilters,
  type Find,
  type Viewer,
} from ".";

/**
 * Olive owns Everyday (Shared) and a private Card, and shares a Joint account with Pat. Pat has a
 * private account Olive can't see. The rows cover each filter: categories, a split, tags, dates,
 * amounts both ways, a transfer and a pending row.
 */
const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  olive: "00000000-0000-4000-8000-0000000000a1",
  pat: "00000000-0000-4000-8000-0000000000a2",
  everyday: "00000000-0000-4000-8000-000000000b01",
  card: "00000000-0000-4000-8000-000000000b02",
  joint: "00000000-0000-4000-8000-000000000b03",
  patPrivate: "00000000-0000-4000-8000-000000000b04",
};
const olive: Viewer = { memberId: ids.olive, householdId: ids.home };
const pat: Viewer = { memberId: ids.pat, householdId: ids.home };
const TODAY = "2026-10-10";

let db: Db;
let close: () => Promise<void>;
let category: Record<string, string>;
let tag: Record<string, string>;

async function found(viewer: Viewer, filters: ActivityFilters): Promise<string[]> {
  const page = await activityPage(db, viewer, "household", filters);
  const total = await countActivity(db, viewer, "household", filters);
  expect(page.rows).toHaveLength(total);
  return page.rows.map((row) => row.description).sort();
}

const find = (more: Partial<Find>) => findFilters({ ...ANYTHING, ...more }, TODAY);

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(households).values({ id: ids.home, name: "Home" });
  const [o, p] = await db
    .insert(users)
    .values([
      { name: "Olive", email: "olive@example.com" },
      { name: "Pat", email: "pat@example.com" },
    ])
    .returning();
  await db.insert(members).values([
    { id: ids.olive, householdId: ids.home, userId: o.id, role: "owner", displayName: "Olive" },
    { id: ids.pat, householdId: ids.home, userId: p.id, role: "partner", displayName: "Pat" },
  ]);
  const account = (id: string, owner: string, name: string, more: object) => ({
    id,
    householdId: ids.home,
    ownerMemberId: owner,
    name,
    ...more,
  });
  await db
    .insert(accounts)
    .values([
      account(ids.everyday, ids.olive, "Everyday", { visibility: "shared" }),
      account(ids.card, ids.olive, "Card", { visibility: "private", kind: "credit" }),
      account(ids.joint, ids.olive, "Joint", { visibility: "shared", isJoint: true }),
      account(ids.patPrivate, ids.pat, "Pat's", { visibility: "private" }),
    ]);
  await addStartingCategories(db, ids.home);
  category = Object.fromEntries(
    (await db.select().from(categories).where(eq(categories.householdId, ids.home))).map((c) => [
      c.name,
      c.id,
    ]),
  );
  const [woolies] = await db
    .insert(merchants)
    .values({ householdId: ids.home, matchText: "WOOLWORTHS", displayName: "Woolworths" })
    .returning();

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
  const group = crypto.randomUUID();
  const inserted = await db
    .insert(transactions)
    .values([
      row(ids.everyday, "2026-10-08", -42_10, "WOOLWORTHS 1187", {
        merchantId: woolies.id,
        categoryId: category["Groceries"],
      }),
      row(ids.everyday, "2026-10-02", -18_40, "BAR LUCA", {
        categoryId: category["Eating out"],
        note: "Dinner with Sam",
      }),
      row(ids.card, "2026-10-09", -64_00, "KMART", { categoryId: category["Groceries"] }),
      row(ids.card, "2026-10-09", -12_00, "COFFEE CART", { pending: true }),
      row(ids.joint, "2026-09-20", -120_00, "GARUDA", { categoryId: category["Travel"] }),
      row(ids.joint, "2026-09-03", 2_500_00, "PAY", { categoryId: category["Income"] }),
      row(ids.everyday, "2026-09-15", -500_00, "TRANSFER TO JOINT", {
        categoryId: category["Transfers"],
        transferGroupId: group,
      }),
      row(ids.joint, "2026-09-15", 500_00, "TRANSFER FROM EVERYDAY", {
        categoryId: category["Transfers"],
        transferGroupId: group,
      }),
      row(ids.everyday, "2026-07-01", -86_20, "AMPOL", { categoryId: category["Transport"] }),
      row(ids.patPrivate, "2026-10-05", -80_00, "FLORIST", { categoryId: category["Gifts"] }),
    ])
    .returning({ id: transactions.id, description: transactions.descriptionRaw });
  const tx = Object.fromEntries(inserted.map((r) => [r.description, r.id]));

  // Kmart is $40 of groceries and $24 of shopping.
  await db.insert(splits).values([
    { transactionId: tx["KMART"], categoryId: category["Groceries"], amountCents: -40_00 },
    { transactionId: tx["KMART"], categoryId: category["Shopping"], amountCents: -24_00 },
  ]);
  const made = await db
    .insert(tags)
    .values([
      { householdId: ids.home, name: "Bali 2027" },
      { householdId: ids.home, name: "Date night" },
    ])
    .returning();
  tag = Object.fromEntries(made.map((t) => [t.name, t.id]));
  await db.insert(transactionTags).values([
    { transactionId: tx["GARUDA"], tagId: tag["Bali 2027"] },
    { transactionId: tx["BAR LUCA"], tagId: tag["Date night"] },
    { transactionId: tx["FLORIST"], tagId: tag["Date night"] },
  ]);
});
afterAll(async () => close());

describe("finding transactions", () => {
  it("shows everything the viewer can see with no filters", async () => {
    expect(await found(olive, find({}))).toHaveLength(9);
    // Pat's private florist is Pat's alone, and Olive's private card is hidden from Pat.
    expect(await found(pat, find({}))).toEqual(
      [
        "BAR LUCA",
        "FLORIST",
        "GARUDA",
        "PAY",
        "TRANSFER FROM EVERYDAY",
        "TRANSFER TO JOINT",
        "WOOLWORTHS 1187",
        "AMPOL",
      ].sort(),
    );
  });

  it("narrows by whose and by account, never past what the viewer can see", async () => {
    expect(await found(olive, find({ mine: true }))).not.toContain("GARUDA");
    expect(await found(olive, find({ mine: true }))).toHaveLength(6);
    expect(await found(olive, find({ accounts: [ids.card] }))).toEqual(["COFFEE CART", "KMART"]);
    expect(await found(olive, find({ accounts: [] }))).toEqual([]);
    // Picking an account you can't see finds nothing in it.
    expect(await found(olive, find({ accounts: [ids.patPrivate] }))).toEqual([]);
    expect(await found(pat, find({ accounts: [ids.card, ids.joint] }))).toEqual([
      "GARUDA",
      "PAY",
      "TRANSFER FROM EVERYDAY",
    ]);
  });

  it("finds a category, a split row by any of its parts", async () => {
    expect(await found(olive, find({ categories: [category["Groceries"]] }))).toEqual([
      "KMART",
      "WOOLWORTHS 1187",
    ]);
    expect(await found(olive, find({ categories: [category["Shopping"]] }))).toEqual(["KMART"]);
    expect(
      await found(olive, find({ categories: [category["Eating out"], category["Travel"]] })),
    ).toEqual(["BAR LUCA", "GARUDA"]);
  });

  it("finds tags, dates, amounts and which way the money went", async () => {
    expect(await found(olive, find({ tags: [tag["Date night"]] }))).toEqual(["BAR LUCA"]);
    expect(await found(pat, find({ tags: [tag["Date night"]] }))).toEqual(["BAR LUCA", "FLORIST"]);
    expect(await found(olive, find({ range: "month" }))).toEqual([
      "BAR LUCA",
      "COFFEE CART",
      "KMART",
      "WOOLWORTHS 1187",
    ]);
    expect(await found(olive, find({ range: "last" }))).toEqual([
      "GARUDA",
      "PAY",
      "TRANSFER FROM EVERYDAY",
      "TRANSFER TO JOINT",
    ]);
    expect(
      await found(olive, find({ range: "custom", from: "2026-07-01", to: "2026-09-03" })),
    ).toEqual(["AMPOL", "PAY"]);
    expect(await found(olive, find({ min: 50_00, max: 120_00 }))).toEqual([
      "AMPOL",
      "GARUDA",
      "KMART",
    ]);
    expect(await found(olive, find({ direction: "in" }))).toEqual([
      "PAY",
      "TRANSFER FROM EVERYDAY",
    ]);
    expect(await found(olive, find({ direction: "out", min: 100_00 }))).toEqual([
      "GARUDA",
      "TRANSFER TO JOINT",
    ]);
  });

  it("leaves out transfers and pending rows when asked", async () => {
    const shown = await found(olive, find({ transfers: false, pending: false }));
    expect(shown).not.toContain("TRANSFER TO JOINT");
    expect(shown).not.toContain("TRANSFER FROM EVERYDAY");
    expect(shown).not.toContain("COFFEE CART");
    expect(shown).toHaveLength(6);
  });

  it("combines every filter with the others and with search", async () => {
    // This month, my own accounts, groceries: Woolworths and the Kmart split.
    const groceries = find({ range: "month", mine: true, categories: [category["Groceries"]] });
    expect(await found(olive, groceries)).toEqual(["KMART", "WOOLWORTHS 1187"]);
    expect(await found(olive, { ...groceries, search: "woolworths" })).toEqual(["WOOLWORTHS 1187"]);
    // A whole amount searches $64.00 to $64.99, and the card picks out Kmart.
    expect(await found(olive, { ...find({ accounts: [ids.card] }), search: "64" })).toEqual([
      "KMART",
    ]);
    // Search finds the note, and the tag narrows it further.
    expect(await found(olive, { search: "sam" })).toEqual(["BAR LUCA"]);
    expect(await found(olive, { ...find({ tags: [tag["Bali 2027"]] }), search: "sam" })).toEqual(
      [],
    );
    // Filters that can't all be true find nothing.
    expect(
      await found(olive, find({ direction: "in", categories: [category["Groceries"]] })),
    ).toEqual([]);
    // To check is a filter like the rest.
    expect(await found(olive, { ...find({ accounts: [ids.card] }), toCheck: true })).toEqual([
      "COFFEE CART",
    ]);
  });
});

describe("filter words", () => {
  it("keeps only what makes sense", () => {
    expect(cleanFind(null)).toEqual(ANYTHING);
    expect(cleanFind({ mine: "yes", accounts: "all", direction: "sideways" })).toEqual(ANYTHING);
    const messy = cleanFind({
      accounts: [ids.card, "nope", ids.card.toUpperCase()],
      range: "custom",
      from: "2026-10-09",
      to: "2026-09-01",
      min: 500,
      max: 100,
      transfers: false,
    });
    expect(messy).toMatchObject({
      accounts: [ids.card],
      from: "2026-09-01",
      to: "2026-10-09",
      min: 100,
      max: 500,
      transfers: false,
      pending: true,
    });
    // Dates only count with a custom range, and amounts must be whole cents.
    expect(cleanFind({ range: "month", from: "2026-01-01", min: 1.5 })).toMatchObject({
      range: "month",
      from: null,
      min: null,
    });
  });

  it("counts date ranges from today", () => {
    expect(rangeDays({ range: "month", from: null, to: null }, TODAY)).toEqual({
      from: "2026-10-01",
      to: null,
    });
    expect(rangeDays({ range: "last", from: null, to: null }, TODAY)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(rangeDays({ range: "3m", from: null, to: null }, TODAY)).toEqual({
      from: "2026-07-11",
      to: null,
    });
    expect(rangeDays({ range: "last", from: null, to: null }, "2026-03-31")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  it("drops what's no longer on offer, and treats every account as any", () => {
    const known = { accounts: [ids.everyday, ids.card], categories: ["c1"], tags: [] };
    expect(
      knownFind(
        { ...ANYTHING, accounts: [ids.everyday, ids.card], categories: ["c1", "c2"] },
        known,
      ),
    ).toMatchObject({ accounts: null, categories: ["c1"] });
    expect(knownFind({ ...ANYTHING, accounts: [ids.card, ids.joint] }, known).accounts).toEqual([
      ids.card,
    ]);
  });
});

describe("saved views", () => {
  const filters = { search: "", find: { ...ANYTHING, range: "month" as const } };

  it("saves views per person, by name, and saving twice changes nothing", async () => {
    const saved = await saveView(db, olive, "  This   month ", filters);
    expect(saved).toMatchObject({ ok: true, view: { name: "This month" } });
    const again = await saveView(db, olive, "this month", {
      search: "woolies",
      find: { ...ANYTHING, range: "month" },
    });
    expect(again).toMatchObject({ ok: true, view: { name: "this month" } });
    const mine = await savedViewList(db, olive);
    expect(mine).toHaveLength(1);
    expect(mine[0].filters.search).toBe("woolies");
    expect(await savedViewList(db, pat)).toEqual([]);
    if (!saved.ok) throw new Error(saved.error);
    // Pat can't take Olive's view away.
    await removeView(db, pat, saved.view.id);
    expect(await savedViewList(db, olive)).toHaveLength(1);
    await removeView(db, olive, saved.view.id);
    expect(await savedViewList(db, olive)).toEqual([]);
  });

  it("refuses an empty or long name, too many views, and strangers", async () => {
    expect(await saveView(db, olive, "  ", filters)).toEqual({
      ok: false,
      error: "Give the view a name.",
    });
    expect(await saveView(db, olive, "x".repeat(41), filters)).toEqual({
      ok: false,
      error: "Keep a name to 40 characters.",
    });
    for (let n = 1; n <= 8; n++) await saveView(db, pat, `View ${n}`, filters);
    expect(await saveView(db, pat, "View 9", filters)).toEqual({
      ok: false,
      error: "You can keep up to 8 views. Remove one to save another.",
    });
    // Saving over one of them is still fine.
    expect(await saveView(db, pat, "View 8", filters)).toMatchObject({ ok: true });
    const stranger: Viewer = { memberId: ids.pat, householdId: crypto.randomUUID() };
    expect(await saveView(db, stranger, "Mine", filters)).toMatchObject({ ok: false });
    expect(await savedViewList(db, stranger)).toEqual([]);
  });

  it("reads back only filters that make sense", async () => {
    await db.insert(savedViews).values({
      memberId: ids.olive,
      name: "Old",
      filters: { search: 42, find: { range: "fortnight", tags: [tag["Bali 2027"]] } },
    });
    const [old] = await savedViewList(db, olive);
    expect(old.filters).toEqual({ search: "", find: { ...ANYTHING, tags: [tag["Bali 2027"]] } });
  });
});
