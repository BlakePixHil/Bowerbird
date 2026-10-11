import { readFileSync } from "node:fs";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import { ICONS } from "@/components/ui/icons";
import { STARTING_CATEGORIES } from "@/config/app";
import type { Db } from "@/lib/db";
import {
  accounts,
  categories,
  households,
  members,
  splits,
  transactions,
  users,
} from "@/lib/db/schema";
import {
  addStartingCategories,
  assignColours,
  fillColourSlots,
  spentByCategory,
  type ColourCategory,
} from "./categories";
import { categoryColour } from "./colour";
import { sortTransactions } from ".";

const spending = (id: string, colourSlot: number | null = null): ColourCategory => ({
  id,
  kind: "spending",
  colourSlot,
  colourPinned: false,
  archived: false,
});
/** Applies the changes, the way `assignColours` saves them. */
const apply = (list: ColourCategory[], changes: Map<string, number | null>) =>
  list.map((c) => (changes.has(c.id) ? { ...c, colourSlot: changes.get(c.id)! } : c));
const slots = (list: ColourCategory[]) =>
  Object.fromEntries(list.filter((c) => c.colourSlot !== null).map((c) => [c.id, c.colourSlot]));

describe("category colours", () => {
  const names = ["groceries", "eating", "transport", "fuel", "bills", "housing", "health", "gifts"];
  const start = [
    ...names.map((name) => spending(name)),
    { ...spending("income"), kind: "income" as const },
    spending("travel"),
  ];

  it("gives the seven biggest spending categories a colour each, biggest first", () => {
    const spent = new Map([
      ["housing", 2400_00],
      ["groceries", 900_00],
      ["eating", 300_00],
      ["transport", 120_00],
      ["fuel", 250_00],
      ["bills", 410_00],
      ["health", 80_00],
      ["gifts", 60_00],
      ["income", 9000_00],
    ]);
    const list = apply(start, fillColourSlots(start, spent));
    expect(slots(list)).toEqual({
      housing: 1,
      groceries: 2,
      bills: 3,
      eating: 4,
      fuel: 5,
      transport: 6,
      health: 7,
    });
    // Income is never spending, and Travel spent nothing, so both stay grey with Gifts.
    expect(list.filter((c) => c.colourSlot === null).map((c) => c.id)).toEqual([
      "gifts",
      "income",
      "travel",
    ]);
  });

  it("keeps every colour where it is when spending changes", () => {
    const first = apply(start, fillColourSlots(start, new Map(names.map((n, i) => [n, 100 + i]))));
    // Now Gifts is the biggest by far, and the old biggest spent nothing.
    const later = new Map(names.map((n, i) => [n, 1000 - i * 100]));
    later.set("gifts", 99_999_00);
    later.set("travel", 50_000_00);
    expect(fillColourSlots(first, later)).toEqual(new Map());
    expect(categoryColour(first.find((c) => c.id === "gifts")!)).toBe("c1");
    expect(categoryColour(first.find((c) => c.id === "travel")!)).toBe("c-other");
  });

  it("fills slots as categories start spending, and never colours one that hasn't", () => {
    const one = apply(start, fillColourSlots(start, new Map([["eating", 40_00]])));
    expect(slots(one)).toEqual({ eating: 1 });
    const two = apply(
      one,
      fillColourSlots(
        one,
        new Map([
          ["eating", 40_00],
          ["groceries", 300_00],
          ["fuel", 90_00],
        ]),
      ),
    );
    expect(slots(two)).toEqual({ eating: 1, groceries: 2, fuel: 3 });
  });

  it("passes a freed colour to the biggest spender without one", () => {
    const full = names.slice(0, 7).map((name, i) => spending(name, i + 1));
    const list = [
      ...full.map((c) => (c.id === "fuel" ? { ...c, archived: true } : c)),
      spending("gifts"),
      spending("travel"),
    ];
    const changes = fillColourSlots(
      list,
      new Map([
        ["gifts", 10_00],
        ["travel", 500_00],
      ]),
    );
    expect(changes).toEqual(
      new Map([
        ["fuel", null],
        ["travel", 4],
      ]),
    );
  });

  it("lets a colour picked by hand win, and moves the category it came from", () => {
    const list = [
      spending("groceries", 1),
      spending("eating", 2),
      { ...spending("travel", 2), colourPinned: true },
      { ...spending("income", 3), kind: "income" as const, colourPinned: true },
    ];
    const changes = fillColourSlots(list, new Map([["eating", 10_00]]));
    expect(changes).toEqual(new Map([["eating", 4]]));
  });

  it("treats a slot outside one to seven as no colour", () => {
    expect(categoryColour({ colourSlot: 8 })).toBe("c-other");
    expect(categoryColour({ colourSlot: 0 })).toBe("c-other");
    expect(categoryColour(null)).toBe("c-other");
    expect(fillColourSlots([spending("odd", 9)], new Map())).toEqual(new Map([["odd", null]]));
  });
});

describe("starting categories", () => {
  it("has 16, each with an icon from the icon set", () => {
    expect(STARTING_CATEGORIES).toHaveLength(16);
    for (const category of STARTING_CATEGORIES) expect(ICONS).toHaveProperty(category.icon);
    const kinds = Map.groupBy(STARTING_CATEGORIES, (category) => category.kind);
    expect(kinds.get("income")?.map((c) => c.name)).toEqual(["Income"]);
    expect(kinds.get("transfer")?.map((c) => c.name)).toEqual(["Transfers"]);
  });
});

describe("categories in a household", () => {
  let db: Db;
  let close: () => Promise<void>;
  const ids = {
    home: "00000000-0000-4000-8000-000000000001",
    older: "00000000-0000-4000-8000-000000000002",
    everyday: "00000000-0000-4000-8000-000000000b01",
  };
  let category: Record<string, string>;

  const listOf = (householdId: string) =>
    db
      .select()
      .from(categories)
      .where(eq(categories.householdId, householdId))
      .orderBy(asc(categories.sortOrder));
  const colours = async () =>
    Object.fromEntries(
      (await listOf(ids.home))
        .filter((c) => c.colourSlot !== null)
        .map((c) => [c.name, c.colourSlot]),
    );
  const spend = (name: string, date: string, amountCents: number, more: object = {}) => ({
    householdId: ids.home,
    accountId: ids.everyday,
    date,
    amountCents,
    descriptionRaw: `${name} ${date}`,
    categoryId: category[name],
    source: "file" as const,
    ...more,
  });

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    await db.insert(households).values([
      { id: ids.home, name: "Home" },
      { id: ids.older, name: "Older" },
    ]);
    const [user] = await db
      .insert(users)
      .values({ name: "Olive", email: "olive@example.com" })
      .returning();
    const [member] = await db
      .insert(members)
      .values({ householdId: ids.home, userId: user.id, role: "owner", displayName: "Olive" })
      .returning();
    await db.insert(accounts).values({
      id: ids.everyday,
      householdId: ids.home,
      ownerMemberId: member.id,
      name: "Everyday",
    });
  });
  afterAll(async () => close());

  it("gives a household the 16 starting categories once", async () => {
    expect(await addStartingCategories(db, ids.home)).toBe(16);
    expect(await addStartingCategories(db, ids.home)).toBe(0);
    const list = await listOf(ids.home);
    expect(list.map(({ name, kind, icon }) => ({ name, kind, icon }))).toEqual(
      STARTING_CATEGORIES.map(({ name, kind, icon }) => ({ name, kind, icon })),
    );
    expect(list.every((c) => c.colourSlot === null)).toBe(true);
    category = Object.fromEntries(list.map((c) => [c.name, c.id]));
  });

  it("gives households made before this the same starting categories", async () => {
    const migration = readFileSync("drizzle/0005_starting_categories.sql", "utf8");
    await db.execute(sql.raw(migration));
    const older = await listOf(ids.older);
    expect(older.map(({ name, kind, icon }) => ({ name, kind, icon }))).toEqual(
      STARTING_CATEGORIES.map(({ name, kind, icon }) => ({ name, kind, icon })),
    );
    expect(older.map((c) => c.sortOrder)).toEqual(STARTING_CATEGORIES.map((_, i) => i));
    // A household that already had categories gets no second set.
    expect(await listOf(ids.home)).toHaveLength(16);
  });

  it("counts money out over the last 3 months, leaving out transfers and money in", async () => {
    const inserted = await db
      .insert(transactions)
      .values([
        spend("Groceries", "2026-09-01", -180_00),
        spend("Groceries", "2026-09-08", -120_00),
        spend("Groceries", "2026-09-09", 20_00), // a refund isn't spending
        spend("Eating out", "2026-08-15", -64_50),
        spend("Housing", "2026-06-29", -2400_00), // more than 3 months before the newest
        spend("Housing", "2026-07-01", -2400_00),
        spend("Transfers", "2026-09-10", -500_00),
        spend("Shopping", "2026-09-11", -300_00, { transferGroupId: crypto.randomUUID() }),
        spend("Income", "2026-09-15", -10_00),
        spend("Other", "2026-09-30", -90_00, { categoryId: null }),
      ])
      .returning();
    // The last row is split: $60 of it Health, $30 Gifts.
    const split = inserted.at(-1)!;
    await db.insert(splits).values([
      { transactionId: split.id, categoryId: category["Health"], amountCents: -60_00 },
      { transactionId: split.id, categoryId: category["Gifts"], amountCents: -30_00 },
    ]);
    const spent = await spentByCategory(db, ids.home);
    const byName = Object.fromEntries(
      Object.entries(category).flatMap(([name, id]) =>
        spent.has(id) ? [[name, spent.get(id)]] : [],
      ),
    );
    expect(byName).toEqual({
      Groceries: 300_00,
      "Eating out": 64_50,
      Housing: 2400_00,
      Health: 60_00,
      Gifts: 30_00,
    });
  });

  it("hands out colours from that spending, and they stay put", async () => {
    expect(await assignColours(db, ids.home)).toBe(5);
    const first = {
      Housing: 1,
      Groceries: 2,
      "Eating out": 3,
      Health: 4,
      Gifts: 5,
    };
    expect(await colours()).toEqual(first);

    // Fuel and Travel start spending a lot. They take the two free colours, and nobody moves.
    await db
      .insert(transactions)
      .values([
        spend("Fuel", "2026-10-01", -5000_00),
        spend("Travel", "2026-10-02", -9000_00),
        spend("Shopping", "2026-10-03", -50_00),
      ]);
    expect(await assignColours(db, ids.home)).toBe(2);
    expect(await colours()).toEqual({ ...first, Travel: 6, Fuel: 7 });

    // All seven are taken, so Shopping stays grey however much it spends.
    await db.insert(transactions).values(spend("Shopping", "2026-10-04", -99_000_00));
    expect(await assignColours(db, ids.home)).toBe(0);
    expect(await colours()).toEqual({ ...first, Travel: 6, Fuel: 7 });
  });

  it("hands out colours after sorting puts a row in a category", async () => {
    await db.update(categories).set({ archived: true }).where(eq(categories.id, category["Gifts"]));
    const [row] = await db
      .insert(transactions)
      .values(spend("Shopping", "2026-10-05", -10_00, { categoryId: null }))
      .returning();
    const { id, accountId, date, amountCents, descriptionRaw: description } = row;
    const shopping = { id: category["Shopping"], name: "Shopping", kind: "spending" as const };
    await sortTransactions(
      db,
      ids.home,
      [{ id, accountId, date, amountCents, description }],
      [
        async (_context, rows) => {
          for (const r of rows) r.category = { ...shopping, icon: "bag", colourSlot: null };
        },
      ],
    );
    // Gifts was archived, so its colour went to Shopping, the biggest spender without one.
    expect(await colours()).toMatchObject({ Shopping: 5 });
    expect(await colours()).not.toHaveProperty("Gifts");
  });
});
