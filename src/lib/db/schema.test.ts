import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import type { Db } from "./client";
import * as t from "./schema";

let db: Db;
let close: () => Promise<void>;
let accountId: string;
let householdId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const [household] = await db.insert(t.households).values({ name: "Test" }).returning();
  const [user] = await db.insert(t.users).values({ email: "a@example.com", name: "A" }).returning();
  const [member] = await db
    .insert(t.members)
    .values({ householdId: household.id, userId: user.id, role: "owner", displayName: "A" })
    .returning();
  const [account] = await db
    .insert(t.accounts)
    .values({ householdId: household.id, ownerMemberId: member.id, name: "Everyday" })
    .returning();
  householdId = household.id;
  accountId = account.id;
}, 30_000);

afterAll(async () => {
  await close();
});

const row = (extra: Partial<typeof t.transactions.$inferInsert>) => ({
  householdId,
  accountId,
  date: "2026-10-10",
  amountCents: -8620,
  descriptionRaw: "WOOLWORTHS 1234 SYDNEY AU",
  source: "file" as const,
  ...extra,
});

describe("schema", () => {
  it("defaults new households to Sydney time and new accounts to private", async () => {
    const [household] = await db.select().from(t.households);
    expect(household.timezone).toBe("Australia/Sydney");
    const [account] = await db.select().from(t.accounts);
    expect(account.visibility).toBe("private");
  });

  it("stores money as exact cents and bank dates as plain dates", async () => {
    const big = 9_000_000_000_001;
    const [inserted] = await db
      .insert(t.transactions)
      .values(row({ amountCents: big, dedupeKey: "big" }))
      .returning();
    expect(inserted.amountCents).toBe(big);
    expect(inserted.date).toBe("2026-10-10");
  });

  it("refuses a second synced transaction with the same id on one account", async () => {
    await db.insert(t.transactions).values(row({ externalId: "tx-1", source: "sync" }));
    await expect(
      db.insert(t.transactions).values(row({ externalId: "tx-1", source: "sync" })),
    ).rejects.toThrow();
  });

  it("refuses a second file row with the same dedupe key on one account", async () => {
    await db.insert(t.transactions).values(row({ dedupeKey: "2026-10-10|-8620|WOOLWORTHS" }));
    await expect(
      db.insert(t.transactions).values(row({ dedupeKey: "2026-10-10|-8620|WOOLWORTHS" })),
    ).rejects.toThrow();
  });

  it("allows many rows with no external id or dedupe key", async () => {
    await db.insert(t.transactions).values([row({}), row({})]);
  });

  it("keeps one balance per account per day", async () => {
    await db.insert(t.balances).values({ accountId, date: "2026-10-10", balanceCents: 100 });
    await expect(
      db.insert(t.balances).values({ accountId, date: "2026-10-10", balanceCents: 200 }),
    ).rejects.toThrow();
  });

  it("treats email addresses as the same whatever their case", async () => {
    await expect(
      db.insert(t.users).values({ email: "A@Example.com", name: "Again" }),
    ).rejects.toThrow();
  });

  it("deletes everything in a household when the household is deleted", async () => {
    await db.delete(t.households);
    expect(await db.select().from(t.transactions)).toHaveLength(0);
    expect(await db.select().from(t.balances)).toHaveLength(0);
    expect(await db.select().from(t.accounts)).toHaveLength(0);
    expect(await db.select().from(t.members)).toHaveLength(0);
  });
});
