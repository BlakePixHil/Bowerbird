import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import type { Db } from "@/lib/db";
import {
  accounts,
  balances,
  budgets,
  categories,
  connections,
  households,
  incomes,
  members,
  merchants,
  rules,
  splits,
  tags,
  transactions,
  transactionTags,
  users,
} from "@/lib/db/schema";
import { exportData, type Viewer } from ".";

/**
 * Olive (Owner) has an everyday account by live sync and a joint saver. Pat (Partner) has a
 * private account and a card set to Balance only. Zed lives in another household.
 */
const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  away: "00000000-0000-4000-8000-000000000002",
  olive: "00000000-0000-4000-8000-0000000000a1",
  pat: "00000000-0000-4000-8000-0000000000a2",
  zed: "00000000-0000-4000-8000-0000000000a3",
  link: "00000000-0000-4000-8000-0000000000c1",
  food: "00000000-0000-4000-8000-0000000000d1",
  fun: "00000000-0000-4000-8000-0000000000d2",
  zedFood: "00000000-0000-4000-8000-0000000000d3",
};
const A = {
  everyday: "00000000-0000-4000-8000-000000000b01",
  saver: "00000000-0000-4000-8000-000000000b02",
  patSecret: "00000000-0000-4000-8000-000000000b03",
  patCard: "00000000-0000-4000-8000-000000000b04",
  zeds: "00000000-0000-4000-8000-000000000b05",
};
const T = {
  coffee: "00000000-0000-4000-8000-000000000e01",
  groceries: "00000000-0000-4000-8000-000000000e02",
  move: "00000000-0000-4000-8000-000000000e03",
  secret: "00000000-0000-4000-8000-000000000e04",
  card: "00000000-0000-4000-8000-000000000e05",
  zeds: "00000000-0000-4000-8000-000000000e06",
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
      name: "Joint saver",
      kind: "savings",
      isJoint: true,
      visibility: "shared",
      createdAt: at(2),
    },
    {
      id: A.patSecret,
      householdId: ids.home,
      ownerMemberId: ids.pat,
      institution: "Hidden Bank",
      name: "Pat's secret",
      createdAt: at(3),
    },
    {
      id: A.patCard,
      householdId: ids.home,
      ownerMemberId: ids.pat,
      name: "Pat's card",
      kind: "credit",
      visibility: "balance_only",
      createdAt: at(4),
    },
    { id: A.zeds, householdId: ids.away, ownerMemberId: ids.zed, name: "Zed's", createdAt: at(5) },
  ]);
  await db.insert(balances).values([
    { accountId: A.everyday, date: "2026-10-01", balanceCents: 1_000_00 },
    { accountId: A.patSecret, date: "2026-10-01", balanceCents: 9_999_00 },
    { accountId: A.patCard, date: "2026-10-01", balanceCents: -250_00, workedOut: true },
    { accountId: A.zeds, date: "2026-10-01", balanceCents: 5_00 },
  ]);
  await db.insert(categories).values([
    { id: ids.food, householdId: ids.home, name: "Food", sortOrder: 1 },
    { id: ids.fun, householdId: ids.home, name: "Fun", sortOrder: 2 },
    { id: ids.zedFood, householdId: ids.away, name: "Zed food" },
  ]);
  const [cafe] = await db
    .insert(merchants)
    .values({ householdId: ids.home, matchText: "CAFE", displayName: "Corner Cafe" })
    .returning();
  const [trip, secretTag] = await db
    .insert(tags)
    .values([
      { householdId: ids.home, name: "Trip" },
      { householdId: ids.home, name: "Surprise" },
    ])
    .returning();
  await db
    .insert(rules)
    .values({ householdId: ids.home, merchantId: cafe.id, categoryId: ids.fun });
  await db.insert(transactions).values([
    {
      id: T.groceries,
      householdId: ids.home,
      accountId: A.everyday,
      date: "2026-10-03",
      amountCents: -80_00,
      descriptionRaw: "GROCER 12",
      categoryId: ids.food,
      source: "sync",
    },
    {
      id: T.coffee,
      householdId: ids.home,
      accountId: A.everyday,
      date: "2026-10-02",
      amountCents: -4_50,
      descriptionRaw: "CAFE 1",
      merchantId: cafe.id,
      categoryId: ids.fun,
      note: "with Pat",
      source: "file",
    },
    {
      id: T.move,
      householdId: ids.home,
      accountId: A.saver,
      date: "2026-10-04",
      amountCents: 100_00,
      descriptionRaw: "TRANSFER",
      transferGroupId: "00000000-0000-4000-8000-0000000000f1",
      source: "file",
    },
    {
      id: T.secret,
      householdId: ids.home,
      accountId: A.patSecret,
      date: "2026-10-02",
      amountCents: -300_00,
      descriptionRaw: "JEWELLER",
      categoryId: ids.fun,
      source: "file",
    },
    {
      id: T.card,
      householdId: ids.home,
      accountId: A.patCard,
      date: "2026-10-02",
      amountCents: -20_00,
      descriptionRaw: "BOOKS",
      categoryId: ids.food,
      source: "file",
    },
    {
      id: T.zeds,
      householdId: ids.away,
      accountId: A.zeds,
      date: "2026-10-02",
      amountCents: -1_00,
      descriptionRaw: "ZED",
      categoryId: ids.zedFood,
      source: "file",
    },
  ]);
  await db.insert(splits).values([
    { transactionId: T.groceries, categoryId: ids.food, amountCents: -60_00 },
    { transactionId: T.groceries, categoryId: ids.fun, amountCents: -20_00 },
    { transactionId: T.secret, categoryId: ids.food, amountCents: -100_00 },
    { transactionId: T.secret, categoryId: ids.fun, amountCents: -200_00 },
  ]);
  await db.insert(transactionTags).values([
    { transactionId: T.coffee, tagId: trip.id },
    { transactionId: T.secret, tagId: secretTag.id },
  ]);
  await db.insert(budgets).values([
    {
      householdId: ids.home,
      scope: "household",
      ownerMemberId: ids.pat,
      categoryId: ids.food,
      amountCents: 600_00,
    },
    {
      householdId: ids.home,
      scope: "personal",
      ownerMemberId: ids.olive,
      categoryId: ids.fun,
      amountCents: 100_00,
    },
    {
      householdId: ids.home,
      scope: "personal",
      ownerMemberId: ids.pat,
      categoryId: ids.fun,
      amountCents: 999_00,
    },
  ]);
  await db.insert(incomes).values([
    {
      householdId: ids.home,
      memberId: ids.olive,
      label: "Olive's pay",
      amountCents: 3_000_00,
      frequency: "fortnightly",
      anchorDate: "2026-10-01",
    },
    {
      householdId: ids.home,
      memberId: ids.pat,
      label: "Pat's pay",
      amountCents: 4_000_00,
      frequency: "monthly",
      anchorDate: "2026-10-15",
    },
  ]);
});

afterAll(async () => {
  await close();
});

describe("exportData", () => {
  it("names the accounts the viewer sees, never a partner's private one", async () => {
    const data = await exportData(db, olive);
    expect(data.accounts.map((a) => [a.name, a.access, a.ownerName, a.live, a.isJoint])).toEqual([
      ["Everyday", "full", null, true, false],
      ["Joint saver", "full", null, false, true],
      ["Pat's card", "balance_only", "Pat", false, false],
    ]);
    expect(JSON.stringify(data)).not.toMatch(/secret|Hidden Bank|JEWELLER|Surprise|9999/i);
  });

  it("has transactions, split parts and tags from accounts seen in full only", async () => {
    const data = await exportData(db, olive);
    expect(data.transactions.map((t) => [t.id, t.transfer, t.tags])).toEqual([
      [T.coffee, false, ["Trip"]],
      [T.groceries, false, []],
      [T.move, true, []],
    ]);
    expect(data.transactions[0]).toMatchObject({
      shop: "Corner Cafe",
      description: "CAFE 1",
      amountCents: -4_50,
      note: "with Pat",
      source: "file",
    });
    expect(data.splits).toHaveLength(2);
    expect(data.splits).toEqual(
      expect.arrayContaining([
        { transactionId: T.groceries, categoryId: ids.food, amountCents: -60_00 },
        { transactionId: T.groceries, categoryId: ids.fun, amountCents: -20_00 },
      ]),
    );
  });

  it("has balances for balance-only accounts, but none of their spending", async () => {
    const data = await exportData(db, olive);
    expect(data.balances.map((b) => [b.accountId, b.balanceCents, b.workedOut])).toEqual([
      [A.everyday, 1_000_00, false],
      [A.patCard, -250_00, true],
    ]);
    expect(data.transactions.some((t) => t.accountId === A.patCard)).toBe(false);
  });

  it("has the household's categories and rules, the household's and your own budgets and pay", async () => {
    const data = await exportData(db, olive);
    expect(data.categories.map((c) => c.name)).toEqual(["Food", "Fun"]);
    expect(data.rules.map((r) => r.shop?.name)).toEqual(["Corner Cafe"]);
    expect(data.budgets.map((b) => [b.scope, b.amountCents])).toEqual([
      ["household", 600_00],
      ["personal", 100_00],
    ]);
    expect(data.incomes.map((i) => i.label)).toEqual(["Olive's pay"]);
  });

  it("gives the Partner their own private account and pay, but not the Owner's", async () => {
    const data = await exportData(db, pat);
    expect(data.accounts.map((a) => a.name)).toEqual(["Joint saver", "Pat's secret", "Pat's card"]);
    expect(data.transactions.map((t) => t.id)).toEqual([T.secret, T.card, T.move]);
    expect(data.incomes.map((i) => i.label)).toEqual(["Pat's pay"]);
    expect(data.budgets.map((b) => b.amountCents)).toEqual([600_00, 999_00]);
  });

  it("gives nothing to someone from another household", async () => {
    const data = await exportData(db, { memberId: ids.zed, householdId: ids.home });
    expect(Object.values(data).every((rows) => rows.length === 0)).toBe(true);
    const own = await exportData(db, zed);
    expect(own.accounts.map((a) => a.name)).toEqual(["Zed's"]);
    expect(JSON.stringify(own)).not.toMatch(/Olive|Pat|Everyday|Food"/);
  });
});
