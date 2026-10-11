import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import type { Db } from "@/lib/db";
import { accounts, balances, connections, households, members, users } from "@/lib/db/schema";
import { changeAccount, ownAccounts, tidyAccountName, type Viewer } from ".";

/**
 * Olive (Owner) brought in an everyday account by live sync, a joint saver from a file and an
 * archived old card. Pat (Partner) has a Shared account of their own. Zed lives elsewhere.
 */
const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  away: "00000000-0000-4000-8000-000000000002",
  olive: "00000000-0000-4000-8000-0000000000a1",
  pat: "00000000-0000-4000-8000-0000000000a2",
  zed: "00000000-0000-4000-8000-0000000000a3",
  link: "00000000-0000-4000-8000-0000000000c1",
};
const A = {
  everyday: "00000000-0000-4000-8000-000000000b01",
  saver: "00000000-0000-4000-8000-000000000b02",
  oldCard: "00000000-0000-4000-8000-000000000b03",
  patShared: "00000000-0000-4000-8000-000000000b04",
  zeds: "00000000-0000-4000-8000-000000000b05",
};

const olive: Viewer = { memberId: ids.olive, householdId: ids.home };
const pat: Viewer = { memberId: ids.pat, householdId: ids.home };
const zed: Viewer = { memberId: ids.zed, householdId: ids.away };

let db: Db;
let close: () => Promise<void>;

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
  await db.insert(connections).values({
    id: ids.link,
    householdId: ids.home,
    memberId: ids.olive,
    kind: "simplefin",
    secretEncrypted: "sealed",
  });
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 0, minute));
  await db.insert(accounts).values([
    {
      id: A.everyday,
      householdId: ids.home,
      ownerMemberId: ids.olive,
      connectionId: ids.link,
      externalId: "ext-1",
      institution: "First Bank",
      name: "Everyday",
      createdAt: at(1),
    },
    {
      id: A.saver,
      householdId: ids.home,
      ownerMemberId: ids.olive,
      institution: "Second Bank",
      name: "Joint saver",
      kind: "savings",
      isJoint: true,
      visibility: "shared",
      createdAt: at(2),
    },
    {
      id: A.oldCard,
      householdId: ids.home,
      ownerMemberId: ids.olive,
      name: "Old card",
      kind: "credit",
      archived: true,
      createdAt: at(3),
    },
    {
      id: A.patShared,
      householdId: ids.home,
      ownerMemberId: ids.pat,
      name: "Pat's everyday",
      visibility: "shared",
      createdAt: at(4),
    },
    {
      id: A.zeds,
      householdId: ids.away,
      ownerMemberId: ids.zed,
      name: "Zed's",
      visibility: "shared",
      createdAt: at(5),
    },
  ]);
  await db.insert(balances).values([
    { accountId: A.everyday, date: "2026-10-01", balanceCents: 100_00 },
    { accountId: A.everyday, date: "2026-10-09", balanceCents: 2_184_00 },
    { accountId: A.oldCard, date: "2026-09-01", balanceCents: -1_284_00 },
    { accountId: A.patShared, date: "2026-10-09", balanceCents: 8_210_00 },
  ]);
});

afterAll(async () => {
  await close();
});

const row = async (id: string) => (await db.select().from(accounts).where(eq(accounts.id, id)))[0];

describe("ownAccounts", () => {
  it("lists only the accounts you brought in, archived ones too, with their newest balance", async () => {
    expect(await ownAccounts(db, olive)).toEqual([
      expect.objectContaining({
        id: A.everyday,
        name: "Everyday",
        institution: "First Bank",
        live: true,
        archived: false,
        includeInBudgets: true,
        balanceCents: 2_184_00,
      }),
      expect.objectContaining({
        id: A.saver,
        isJoint: true,
        kind: "savings",
        live: false,
        balanceCents: null,
      }),
      expect.objectContaining({ id: A.oldCard, archived: true, balanceCents: -1_284_00 }),
    ]);
  });

  it("leaves out a partner's accounts, even shared ones, and other households'", async () => {
    expect((await ownAccounts(db, pat)).map((a) => a.id)).toEqual([A.patShared]);
    expect((await ownAccounts(db, zed)).map((a) => a.id)).toEqual([A.zeds]);
    expect(await ownAccounts(db, { memberId: ids.zed, householdId: ids.home })).toEqual([]);
  });
});

describe("changeAccount", () => {
  it("renames an account, tidying the spaces", async () => {
    expect(await changeAccount(db, olive, A.everyday, { name: "  Bills   account " })).toEqual({
      ok: true,
      name: "Bills account",
    });
    expect((await row(A.everyday)).name).toBe("Bills account");
  });

  it("won't take an empty or overlong name", async () => {
    expect(await changeAccount(db, olive, A.everyday, { name: "   " })).toEqual({
      ok: false,
      error: "Give the account a name.",
    });
    expect(await changeAccount(db, olive, A.everyday, { name: "x".repeat(61) })).toMatchObject({
      ok: false,
    });
    expect(await changeAccount(db, olive, A.everyday, { name: 42 })).toMatchObject({ ok: false });
    expect((await row(A.everyday)).name).toBe("Bills account");
  });

  it("sets whether it counts toward budgets", async () => {
    await changeAccount(db, olive, A.saver, { includeInBudgets: false });
    expect((await row(A.saver)).includeInBudgets).toBe(false);
    await changeAccount(db, olive, A.saver, { includeInBudgets: true });
    expect((await row(A.saver)).includeInBudgets).toBe(true);
  });

  it("archives an account and brings it back, keeping its balances", async () => {
    expect(await changeAccount(db, olive, A.oldCard, { archived: false })).toEqual({
      ok: true,
      name: "Old card",
    });
    expect((await row(A.oldCard)).archived).toBe(false);
    await changeAccount(db, olive, A.oldCard, { archived: true });
    expect((await row(A.oldCard)).archived).toBe(true);
    expect(await db.select().from(balances).where(eq(balances.accountId, A.oldCard))).toHaveLength(
      1,
    );
  });

  it("ignores anything that isn't a yes or no", async () => {
    await changeAccount(db, olive, A.saver, { includeInBudgets: "no", archived: 1 });
    expect(await row(A.saver)).toMatchObject({ includeInBudgets: true, archived: false });
  });

  it("only lets the person who brought it in change it", async () => {
    const refused = {
      ok: false,
      error: "Only the person who brought this account in can change it.",
    };
    expect(await changeAccount(db, pat, A.saver, { name: "Mine now" })).toEqual(refused);
    expect(await changeAccount(db, olive, A.patShared, { archived: true })).toEqual(refused);
    expect(await changeAccount(db, zed, A.everyday, { includeInBudgets: false })).toEqual(refused);
    expect(
      await changeAccount(db, { memberId: ids.olive, householdId: ids.away }, A.everyday, {
        name: "Nope",
      }),
    ).toEqual(refused);
    expect(await row(A.saver)).toMatchObject({ name: "Joint saver" });
    expect(await row(A.patShared)).toMatchObject({ archived: false });
    expect(await row(A.everyday)).toMatchObject({ includeInBudgets: true });
  });
});

describe("tidyAccountName", () => {
  it("keeps names to 60 characters", () => {
    expect(tidyAccountName("x".repeat(60))).toBe("x".repeat(60));
    expect(tidyAccountName("x".repeat(61))).toEqual({
      ok: false,
      error: "Keep the name to 60 characters or fewer.",
    });
  });
});
