import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { deleteHousehold, sameName, type Viewer } from ".";

const TABLES: PgTable[] = (Object.values(schema) as unknown[]).filter((value): value is PgTable =>
  is(value, PgTable),
);

let db: Db;
let close: () => Promise<void>;

/** Rows in every table, by table name. */
async function counts(): Promise<Record<string, number>> {
  const entries = await Promise.all(
    TABLES.map(async (table) => {
      const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
      return [getTableName(table), row.n] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * A household with a row in every table: two people, passkeys, a session and a sign-in link,
 * live sync with its bank, an account with balances, a shop, categories, a tag, a rule, an
 * import, transactions (one split, one tagged), pay, a budget, a saved view and a saved change.
 */
async function fill(name: string, emails: [string, string]) {
  const s = schema;
  const [household] = await db.insert(s.households).values({ name }).returning();
  const people = await db
    .insert(s.users)
    .values(emails.map((email, i) => ({ email, name: `Person ${i}` })))
    .returning();
  const [owner, partner] = await db
    .insert(s.members)
    .values([
      { householdId: household.id, userId: people[0].id, role: "owner", displayName: "Owner" },
      { householdId: household.id, userId: people[1].id, role: "partner", displayName: "Partner" },
    ] as const)
    .returning();
  await db.insert(s.passkeys).values(
    people.map((person, i) => ({
      userId: person.id,
      credentialId: `${name}-cred-${i}`,
      publicKey: "pk",
    })),
  );
  await db.insert(s.sessions).values({
    id: `${name}-session`,
    userId: people[0].id,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  await db.insert(s.emailLinks).values({
    email: emails[1].toUpperCase(),
    tokenHash: `${name}-token`,
    expiresAt: new Date(Date.now() + 900_000),
  });
  const [link] = await db
    .insert(s.connections)
    .values({
      householdId: household.id,
      memberId: owner.id,
      kind: "simplefin",
      secretEncrypted: "sealed",
    })
    .returning();
  await db.insert(s.connectionBanks).values({ connectionId: link.id, name: "First Bank" });
  const [account] = await db
    .insert(s.accounts)
    .values({
      householdId: household.id,
      ownerMemberId: owner.id,
      connectionId: link.id,
      externalId: "ext",
      name: "Everyday",
    })
    .returning();
  await db.insert(s.balances).values([
    { accountId: account.id, date: "2026-10-01", balanceCents: 100_00 },
    { accountId: account.id, date: "2026-10-02", balanceCents: 90_00, workedOut: true },
  ]);
  const [shop] = await db
    .insert(s.merchants)
    .values({ householdId: household.id, matchText: "SHOP", displayName: "Shop" })
    .returning();
  const [food, fun] = await db
    .insert(s.categories)
    .values([
      { householdId: household.id, name: "Food" },
      { householdId: household.id, name: "Fun" },
    ])
    .returning();
  const [tag] = await db
    .insert(s.tags)
    .values({ householdId: household.id, name: "Trip" })
    .returning();
  await db.insert(s.rules).values({
    householdId: household.id,
    merchantId: shop.id,
    categoryId: food.id,
    tagId: tag.id,
  });
  const [file] = await db
    .insert(s.imports)
    .values({
      householdId: household.id,
      accountId: account.id,
      memberId: owner.id,
      filename: "sep.csv",
      format: "csv",
    })
    .returning();
  const [split, tagged] = await db
    .insert(s.transactions)
    .values([
      {
        householdId: household.id,
        accountId: account.id,
        date: "2026-10-02",
        amountCents: -10_00,
        descriptionRaw: "SHOP 1",
        merchantId: shop.id,
        categoryId: food.id,
        source: "file",
        importId: file.id,
        note: "a note",
      },
      {
        householdId: household.id,
        accountId: account.id,
        date: "2026-10-02",
        amountCents: -5_00,
        descriptionRaw: "SHOP 2",
        categoryId: fun.id,
        source: "sync",
      },
    ])
    .returning();
  await db.insert(s.splits).values([
    { transactionId: split.id, categoryId: food.id, amountCents: -6_00 },
    { transactionId: split.id, categoryId: fun.id, amountCents: -4_00 },
  ]);
  await db.insert(s.transactionTags).values({ transactionId: tagged.id, tagId: tag.id });
  await db.insert(s.incomes).values({
    householdId: household.id,
    memberId: partner.id,
    label: "Pay",
    amountCents: 2_000_00,
    frequency: "fortnightly",
    anchorDate: "2026-10-01",
  });
  await db.insert(s.budgets).values({
    householdId: household.id,
    ownerMemberId: owner.id,
    categoryId: food.id,
    amountCents: 500_00,
  });
  await db.insert(s.savedViews).values({ memberId: owner.id, name: "Mine", filters: {} });
  await db.insert(s.appliedChanges).values({
    id: crypto.randomUUID(),
    memberId: partner.id,
    kind: "category",
  });
  return {
    owner: { memberId: owner.id, householdId: household.id } satisfies Viewer,
    partner: { memberId: partner.id, householdId: household.id } satisfies Viewer,
  };
}

let home: Awaited<ReturnType<typeof fill>>;
let away: Awaited<ReturnType<typeof fill>>;
let before: Record<string, number>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  away = await fill("Away", ["zed@example.com", "yan@example.com"]);
  before = await counts();
  home = await fill("Our household", ["olive@example.com", "pat@example.com"]);
});

afterAll(async () => {
  await close();
});

describe("deleteHousehold", () => {
  it("has a row in every table to delete, so a new table can't be missed", async () => {
    const filled = await counts();
    for (const table of Object.keys(filled)) {
      expect(filled[table], table).toBeGreaterThan(before[table]);
    }
  });

  it("is only for the Owner, who types the household's name", async () => {
    expect(await deleteHousehold(db, home.partner, "Our household")).toEqual({
      ok: false,
      error: "Only the Owner can delete the household.",
    });
    expect(await deleteHousehold(db, home.owner, "Our house")).toEqual({
      ok: false,
      error: "Type the household’s name, Our household, to confirm.",
    });
    expect(await deleteHousehold(db, home.owner, undefined)).toMatchObject({ ok: false });
    expect(
      await deleteHousehold(
        db,
        { memberId: away.owner.memberId, householdId: home.owner.householdId },
        "Our household",
      ),
    ).toEqual({ ok: false, error: "That household isn't yours to delete." });
    expect(await counts()).not.toEqual(before);
  });

  it("deletes every row that belongs to it, and nothing of anyone else's", async () => {
    expect(await deleteHousehold(db, home.owner, "  our   HOUSEHOLD ")).toEqual({
      ok: true,
      hadLiveSync: true,
    });
    expect(await counts()).toEqual(before);
  });
});

describe("sameName", () => {
  it("ignores case and extra spaces, nothing else", () => {
    expect(sameName("our household", "Our household")).toBe(true);
    expect(sameName("Our household.", "Our household")).toBe(false);
    expect(sameName(null, "Our household")).toBe(false);
  });
});
