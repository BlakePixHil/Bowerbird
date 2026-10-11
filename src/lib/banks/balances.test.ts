import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import type { Db } from "@/lib/db";
import { accounts, balances, households, members, transactions, users } from "@/lib/db/schema";
import {
  carryBalancesForward,
  dailyBalances,
  fillBalances,
  saveGivenBalance,
  saveGivenBalances,
} from "./balances";

describe("dailyBalances", () => {
  const moves = (days: Record<string, number>) => new Map(Object.entries(days));

  it("carries a balance forward through the days after it", () => {
    expect(
      dailyBalances(
        "2026-09-01",
        "2026-09-04",
        [{ date: "2026-09-01", balanceCents: 100_00 }],
        moves({ "2026-09-03": -20_00 }),
      ),
    ).toEqual([
      { date: "2026-09-01", balanceCents: 100_00, workedOut: false },
      { date: "2026-09-02", balanceCents: 100_00, workedOut: true },
      { date: "2026-09-03", balanceCents: 80_00, workedOut: true },
      { date: "2026-09-04", balanceCents: 80_00, workedOut: true },
    ]);
  });

  it("works back from the first balance through the days before it", () => {
    expect(
      dailyBalances(
        "2026-09-01",
        "2026-09-04",
        [{ date: "2026-09-04", balanceCents: 80_00 }],
        // The first day's own rows are already in its closing balance, so they change nothing.
        moves({
          "2026-09-01": 999_00,
          "2026-09-02": 50_00,
          "2026-09-03": -20_00,
          "2026-09-04": -10_00,
        }),
      ),
    ).toEqual([
      { date: "2026-09-01", balanceCents: 60_00, workedOut: true },
      { date: "2026-09-02", balanceCents: 110_00, workedOut: true },
      { date: "2026-09-03", balanceCents: 90_00, workedOut: true },
      { date: "2026-09-04", balanceCents: 80_00, workedOut: false },
    ]);
  });

  it("starts again from each balance it's given", () => {
    expect(
      dailyBalances(
        "2026-09-01",
        "2026-09-04",
        [
          { date: "2026-09-01", balanceCents: 100_00 },
          { date: "2026-09-03", balanceCents: 500_00 },
        ],
        moves({ "2026-09-02": -10_00, "2026-09-03": -10_00, "2026-09-04": 5_00 }),
      ),
    ).toEqual([
      { date: "2026-09-01", balanceCents: 100_00, workedOut: false },
      { date: "2026-09-02", balanceCents: 90_00, workedOut: true },
      { date: "2026-09-03", balanceCents: 500_00, workedOut: false },
      { date: "2026-09-04", balanceCents: 505_00, workedOut: true },
    ]);
  });

  it("crosses months and years", () => {
    const days = dailyBalances(
      "2026-12-30",
      "2027-01-02",
      [{ date: "2027-01-01", balanceCents: 10_00 }],
      moves({ "2027-01-01": 1_00, "2027-01-02": 2_00 }),
    );
    expect(days.map((day) => [day.date, day.balanceCents])).toEqual([
      ["2026-12-30", 9_00],
      ["2026-12-31", 9_00],
      ["2027-01-01", 10_00],
      ["2027-01-02", 12_00],
    ]);
  });

  it("gives nothing when there's no balance to work from", () => {
    expect(dailyBalances("2026-09-01", "2026-09-04", [], moves({ "2026-09-02": 5_00 }))).toEqual(
      [],
    );
  });
});

describe("saving daily balances", () => {
  let db: Db;
  let close: () => Promise<void>;
  let householdId: string;
  let memberId: string;

  // Midday on Sat 12 Sep 2026 in Sydney.
  const NOW = new Date("2026-09-12T02:00:00Z");

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    householdId = randomUUID();
    await db.insert(households).values({ id: householdId, name: "Home" });
    const [user] = await db
      .insert(users)
      .values({ name: "Olive", email: "olive@example.com" })
      .returning();
    const [member] = await db
      .insert(members)
      .values({ householdId, userId: user.id, role: "owner", displayName: "Olive" })
      .returning();
    memberId = member.id;
  });
  afterAll(async () => close());

  async function account(rows: { date: string; amountCents: number; pending?: boolean }[] = []) {
    const [made] = await db
      .insert(accounts)
      .values({ householdId, ownerMemberId: memberId, name: "Everyday", institution: null })
      .returning({ id: accounts.id });
    if (rows.length > 0)
      await db.insert(transactions).values(
        rows.map((row) => ({
          householdId,
          accountId: made.id,
          descriptionRaw: "x",
          source: "sync" as const,
          ...row,
        })),
      );
    return made.id;
  }

  const days = (accountId: string) =>
    db
      .select({
        date: balances.date,
        balanceCents: balances.balanceCents,
        workedOut: balances.workedOut,
      })
      .from(balances)
      .where(eq(balances.accountId, accountId))
      .orderBy(asc(balances.date));

  it("fills every day from the first row to today, leaving out pending rows", async () => {
    const id = await account([
      { date: "2026-09-08", amountCents: -10_00 },
      { date: "2026-09-10", amountCents: 25_00 },
      { date: "2026-09-11", amountCents: -99_00, pending: true },
    ]);
    await saveGivenBalance(db, id, { date: "2026-09-10", balanceCents: 200_00 });
    expect(await fillBalances(db, id, NOW)).toBe(4);
    expect(await days(id)).toEqual([
      { date: "2026-09-08", balanceCents: 175_00, workedOut: true },
      { date: "2026-09-09", balanceCents: 175_00, workedOut: true },
      { date: "2026-09-10", balanceCents: 200_00, workedOut: false },
      { date: "2026-09-11", balanceCents: 200_00, workedOut: true },
      { date: "2026-09-12", balanceCents: 200_00, workedOut: true },
    ]);
    // Nothing changed, so nothing is written again.
    expect(await fillBalances(db, id, NOW)).toBe(0);
  });

  it("lets a given balance replace a worked-out one, never the other way", async () => {
    const id = await account([{ date: "2026-09-11", amountCents: -5_00 }]);
    await saveGivenBalance(db, id, { date: "2026-09-10", balanceCents: 100_00 });
    await fillBalances(db, id, NOW);
    expect((await days(id)).at(-1)).toEqual({
      date: "2026-09-12",
      balanceCents: 95_00,
      workedOut: true,
    });

    // The bank's own balance for the 11th wins, and the 12th carries on from it.
    await saveGivenBalances(db, id, [{ date: "2026-09-11", balanceCents: 90_00 }]);
    await fillBalances(db, id, NOW);
    expect(await days(id)).toEqual([
      { date: "2026-09-10", balanceCents: 100_00, workedOut: false },
      { date: "2026-09-11", balanceCents: 90_00, workedOut: false },
      { date: "2026-09-12", balanceCents: 90_00, workedOut: true },
    ]);
  });

  it("saves no balances for an account that was never given one", async () => {
    const id = await account([{ date: "2026-09-11", amountCents: -5_00 }]);
    expect(await fillBalances(db, id, NOW)).toBe(0);
    expect(await days(id)).toEqual([]);
  });

  it("carries every account behind today forward, inside the time budget", async () => {
    const behind = await account([{ date: "2026-09-11", amountCents: -5_00 }]);
    await saveGivenBalance(db, behind, { date: "2026-09-10", balanceCents: 100_00 });
    const archived = await account();
    await saveGivenBalance(db, archived, { date: "2026-09-10", balanceCents: 1_00 });
    await db.update(accounts).set({ archived: true }).where(eq(accounts.id, archived));

    const later = new Date("2026-09-14T02:00:00Z");
    expect(await carryBalancesForward(db, { now: () => later, budgetMs: 0 })).toMatchObject({
      accounts: 0,
    });
    const carried = await carryBalancesForward(db, { now: () => later });
    expect(carried.left).toBe(0);
    expect(carried.accounts).toBeGreaterThanOrEqual(1);
    expect((await days(behind)).map((day) => [day.date, day.balanceCents])).toEqual([
      ["2026-09-10", 100_00],
      ["2026-09-11", 95_00],
      ["2026-09-12", 95_00],
      ["2026-09-13", 95_00],
      ["2026-09-14", 95_00],
    ]);
    expect(await days(archived)).toHaveLength(1);
    // Every account is up to date now.
    expect(await carryBalancesForward(db, { now: () => later })).toEqual({ accounts: 0, left: 0 });
  });
});
