import { desc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import type { Db } from "@/lib/db";
import {
  accounts,
  categories,
  households,
  members,
  merchants,
  splits,
  tags,
  transactions,
  transactionTags,
  users,
} from "@/lib/db/schema";
import { addDays, spentBy, sumCents } from "@/lib/money";
import {
  activityCounts,
  activityPage,
  countActivity,
  dailySpending,
  moneyInOut,
  type ActivityFilters,
  type ActivityRow,
  type View,
  type Viewer,
} from ".";

/**
 * Olive (Owner) has an everyday account and a joint account. Pat (Partner) has one Shared account
 * Olive can see, and one Private account she can't. Another household has a row no one here may
 * see. Olive's everyday account has two or three rows a day for 120 days, so paging has work to do.
 */
const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  away: "00000000-0000-4000-8000-000000000002",
  olive: "00000000-0000-4000-8000-0000000000a1",
  pat: "00000000-0000-4000-8000-0000000000a2",
  zed: "00000000-0000-4000-8000-0000000000a3",
  everyday: "00000000-0000-4000-8000-000000000b01",
  joint: "00000000-0000-4000-8000-000000000b02",
  patShared: "00000000-0000-4000-8000-000000000b03",
  patPrivate: "00000000-0000-4000-8000-000000000b04",
  zed1: "00000000-0000-4000-8000-000000000b05",
  groceries: "00000000-0000-4000-8000-000000000c01",
  transfers: "00000000-0000-4000-8000-000000000c02",
  income: "00000000-0000-4000-8000-000000000c03",
  woolworths: "00000000-0000-4000-8000-000000000d01",
  bali: "00000000-0000-4000-8000-000000000e01",
};
const TODAY = "2026-10-10";
const olive: Viewer = { memberId: ids.olive, householdId: ids.home };
const zed: Viewer = { memberId: ids.zed, householdId: ids.away };

let db: Db;
let close: () => Promise<void>;

/** The special rows, by name, once saved. */
const special: Record<string, string> = {};

type NewRow = typeof transactions.$inferInsert;
const row = (
  accountId: string,
  date: string,
  amountCents: number,
  descriptionRaw: string,
  more: Partial<NewRow> = {},
): NewRow => ({
  householdId: accountId === ids.zed1 ? ids.away : ids.home,
  accountId,
  date,
  amountCents,
  descriptionRaw,
  source: "file",
  ...more,
});

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
      institution: "Bank A",
      visibility: "private",
    },
    {
      id: ids.joint,
      householdId: ids.home,
      ownerMemberId: ids.olive,
      name: "Joint",
      institution: "Bank B",
      visibility: "shared",
      isJoint: true,
    },
    {
      id: ids.patShared,
      householdId: ids.home,
      ownerMemberId: ids.pat,
      name: "Pat's card",
      institution: "Bank C",
      visibility: "shared",
    },
    {
      id: ids.patPrivate,
      householdId: ids.home,
      ownerMemberId: ids.pat,
      name: "Pat's secret",
      institution: "Bank C",
      visibility: "private",
    },
    {
      id: ids.zed1,
      householdId: ids.away,
      ownerMemberId: ids.zed,
      name: "Zed's",
      institution: "Bank Z",
      visibility: "shared",
    },
  ]);
  await db.insert(categories).values([
    { id: ids.groceries, householdId: ids.home, name: "Groceries", icon: "cart", colourSlot: 2 },
    { id: ids.transfers, householdId: ids.home, name: "Transfers", kind: "transfer" },
    { id: ids.income, householdId: ids.home, name: "Income", kind: "income" },
  ]);
  await db.insert(merchants).values({
    id: ids.woolworths,
    householdId: ids.home,
    matchText: "WOOLWORTHS",
    displayName: "Woolworths",
  });
  await db.insert(tags).values({ id: ids.bali, householdId: ids.home, name: "Bali 2027" });

  // Filler: two or three coffees a day on Everyday, for 120 days before the special days.
  const filler: NewRow[] = [];
  for (let back = 3; back < 123; back++) {
    const date = addDays(TODAY, -back);
    for (let n = 0; n < 2 + (back % 2); n++)
      filler.push(
        row(
          ids.everyday,
          date,
          -(400 + back * 3 + n),
          `CAFE ${back}-${n}`,
          n === 0 ? { categoryId: ids.groceries } : {},
        ),
      );
  }
  await db.insert(transactions).values(filler);

  const named: Record<string, NewRow> = {
    woolworths: row(ids.joint, TODAY, -86_20, "WOOLWORTHS 1234 SYDNEY AU", {
      merchantId: ids.woolworths,
      categoryId: ids.groceries,
    }),
    pending: row(ids.everyday, TODAY, -26_20, "GUZMAN Y GOMEZ 088", { pending: true }),
    salary: row(ids.everyday, addDays(TODAY, -1), 3260_00, "ACME SALARY", {
      categoryId: ids.income,
    }),
    transferOut: row(ids.everyday, addDays(TODAY, -1), -2200_00, "TRANSFER TO JOINT", {
      transferGroupId: ids.bali,
    }),
    transferIn: row(ids.joint, addDays(TODAY, -1), 2200_00, "TRANSFER FROM EVERYDAY", {
      transferGroupId: ids.bali,
    }),
    savings: row(ids.everyday, addDays(TODAY, -1), -500_00, "TO SAVINGS", {
      categoryId: ids.transfers,
    }),
    refund: row(ids.joint, addDays(TODAY, -1), 20_00, "COLES REFUND", {
      categoryId: ids.groceries,
    }),
    kmart: row(ids.joint, addDays(TODAY, -2), -64_00, "KMART 1077 BROADWAY", {
      categoryId: ids.groceries,
    }),
    booking: row(ids.joint, addDays(TODAY, -2), -420_00, "BOOKING.COM 50%OFF", {
      categoryId: ids.groceries,
    }),
    pat: row(ids.patShared, addDays(TODAY, -2), -30_00, "PAT'S LUNCH"),
    secret: row(ids.patPrivate, addDays(TODAY, -2), -99_99, "SECRET GIFT"),
    away: row(ids.zed1, addDays(TODAY, -2), -86_20, "WOOLWORTHS AWAY"),
  };
  for (const [key, value] of Object.entries(named)) {
    const [saved] = await db.insert(transactions).values(value).returning({ id: transactions.id });
    special[key] = saved.id;
  }
  await db.insert(transactionTags).values({ transactionId: special.booking, tagId: ids.bali });
  await db.insert(splits).values([
    { transactionId: special.kmart, categoryId: ids.groceries, amountCents: -40_00 },
    { transactionId: special.kmart, categoryId: ids.groceries, amountCents: -24_00 },
  ]);
});
afterAll(async () => close());

/** Every page, one after another. */
async function walk(view: View, filters: ActivityFilters = {}, pageRows = 50) {
  const pages: ActivityRow[][] = [];
  let before: string | undefined;
  for (;;) {
    const page = await activityPage(db, olive, view, filters, before, pageRows);
    pages.push(page.rows);
    if (!page.next) return pages;
    before = page.next;
  }
}

/** What the database holds for Olive's visible accounts, newest first by date then id. */
async function expected(accountIds: string[]): Promise<string[]> {
  const rows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(inArray(transactions.accountId, accountIds))
    .orderBy(desc(transactions.date), desc(transactions.id));
  return rows.map((r) => r.id);
}

const VISIBLE = [ids.everyday, ids.joint, ids.patShared];
const searchIds = async (search: string) =>
  (await walk("household", { search })).flat().map((r) => r.id);

describe("activityPage", () => {
  it("lists every row the viewer can see, newest first, a whole day at a time", async () => {
    const pages = await walk("household");
    expect(pages.length).toBeGreaterThan(3);
    expect(pages.flat().map((r) => r.id)).toEqual(await expected(VISIBLE));
    for (const [i, page] of pages.entries()) {
      if (i < pages.length - 1) expect(page.length).toBeGreaterThanOrEqual(50);
      const days = new Set(page.map((r) => r.date));
      for (const other of pages.slice(i + 1))
        expect(other.some((r) => days.has(r.date))).toBe(false);
    }
    expect(pages.flat().some((r) => r.id === special.secret || r.id === special.away)).toBe(false);
  });

  it("splits the views with no overlap, and shows other households nothing", async () => {
    const mine = (await walk("mine")).flat();
    const shared = (await walk("shared")).flat();
    const partner = (await walk("partner")).flat();
    expect(new Set(mine.map((r) => r.whose))).toEqual(new Set(["mine"]));
    expect(shared).toHaveLength(5);
    expect(shared.every((r) => r.account.name === "Joint")).toBe(true);
    expect(partner.map((r) => r.id)).toEqual([special.pat]);
    expect(mine.length + shared.length + partner.length).toBe((await expected(VISIBLE)).length);
    expect(await activityPage(db, zed, "household")).toMatchObject({
      rows: [{ description: "WOOLWORTHS AWAY" }],
    });
  });

  it("fills in the shop, category, tags, splits and whose", async () => {
    const rows = new Map((await walk("household")).flat().map((r) => [r.id, r]));
    expect(rows.get(special.woolworths)).toMatchObject({
      shop: "Woolworths",
      description: "WOOLWORTHS 1234 SYDNEY AU",
      category: { name: "Groceries", kind: "spending", icon: "cart", colourSlot: 2 },
      account: { name: "Joint", institution: "Bank B" },
      whose: "shared",
      notCounted: false,
      pending: false,
    });
    expect(rows.get(special.pending)).toMatchObject({
      shop: "GUZMAN Y GOMEZ 088",
      category: null,
      pending: true,
      whose: "mine",
    });
    expect(rows.get(special.transferOut)?.notCounted).toBe(true);
    expect(rows.get(special.savings)?.notCounted).toBe(true);
    expect(rows.get(special.booking)?.tags.map((tag) => tag.name)).toEqual(["Bali 2027"]);
    expect(rows.get(special.kmart)?.parts).toHaveLength(2);
    expect(rows.get(special.pat)?.whose).toBe("partner");
  });

  it("finds rows by shop, bank text, tag or amount", async () => {
    expect(await searchIds("woolworths")).toEqual([special.woolworths]);
    expect(await searchIds("guzman")).toEqual([special.pending]);
    expect(await searchIds("bali")).toEqual([special.booking]);
    expect(await searchIds("86.20")).toEqual([special.woolworths]);
    expect(new Set(await searchIds("$2,200"))).toEqual(
      new Set([special.transferOut, special.transferIn]),
    );
    expect(await searchIds("$420")).toEqual([special.booking]);
    expect(await searchIds("64.00")).toEqual([special.kmart]);
    expect(await searchIds("50%")).toEqual([special.booking]);
    expect(await searchIds("%")).toEqual([special.booking]);
    expect(await searchIds("secret")).toEqual([]);
  });

  it("narrows to rows left to check", async () => {
    const rows = (await walk("household", { toCheck: true })).flat();
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.every((r) => r.category === null && !r.notCounted)).toBe(true);
    expect(rows.map((r) => r.id)).toContain(special.pending);
  });
});

describe("activity counts", () => {
  it("counts everything, by whose, and what's left to check", async () => {
    const all = (await expected(VISIBLE)).length;
    const counts = await activityCounts(db, olive);
    expect(counts.all).toBe(all);
    expect(counts.byWhose).toEqual({ mine: all - 6, shared: 5, partner: 1 });
    expect(counts.toCheck).toBe((await walk("household", { toCheck: true })).flat().length);
    expect(counts.since).toBe(addDays(TODAY, -122));
    expect((await activityCounts(db, zed)).since).not.toBeNull();
    expect(await countActivity(db, olive, "household", { search: "woolworths" })).toBe(1);
    expect(await countActivity(db, olive, "shared")).toBe(5);
  });
});

describe("moneyInOut", () => {
  it("adds up money in and out without transfers, matching the list for the same days", async () => {
    const from = addDays(TODAY, -30);
    const totals = await moneyInOut(db, olive, "household", { from, to: TODAY });
    const rows = (await walk("household", { from, to: TODAY, transfers: false })).flat();
    expect(rows.every((r) => !r.notCounted)).toBe(true);
    expect(totals).toEqual({
      in: sumCents(rows.filter((r) => r.amountCents > 0).map((r) => r.amountCents)),
      out: sumCents(rows.map(spentBy)),
    });
    expect(totals.in).toBeGreaterThan(0);
    expect(totals.out).toBeGreaterThan(0);
    // Pat's private account and the other household stay out.
    expect(await moneyInOut(db, zed, "household", { from, to: TODAY })).not.toEqual(totals);
  });
});

describe("dailySpending", () => {
  it("leaves out transfers and money in, keeps pending, and matches the list's day totals", async () => {
    const { days, since } = await dailySpending(db, olive, "household", {
      from: addDays(TODAY, -13),
      to: TODAY,
    });
    expect(since).toBe(addDays(TODAY, -122));
    const on = (date: string) => days.find((d) => d.date === date)?.cents ?? 0;
    expect(on(TODAY)).toBe(86_20 + 26_20);
    expect(on(addDays(TODAY, -1))).toBe(0);
    expect(on(addDays(TODAY, -2))).toBe(64_00 + 420_00 + 30_00);

    // The same week, added up from the rows on the list.
    const rows = (await walk("household")).flat().filter((r) => r.date >= addDays(TODAY, -13));
    expect(sumCents(days.map((d) => d.cents))).toBe(sumCents(rows.map(spentBy)));
  });

  it("matches a plain sum over the database", async () => {
    const from = addDays(TODAY, -6);
    const { days } = await dailySpending(db, olive, "mine", { from, to: TODAY });
    const [plain] = await db
      .select({
        total: sql<number>`coalesce(sum(-${transactions.amountCents}), 0)`.mapWith(Number),
      })
      .from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(
        sql`${transactions.accountId} = ${ids.everyday} and ${transactions.date} between ${from} and ${TODAY}
          and ${transactions.amountCents} < 0 and ${transactions.transferGroupId} is null
          and coalesce(${categories.kind}::text, '') <> 'transfer'`,
      );
    expect(sumCents(days.map((d) => d.cents))).toBe(plain.total);
  });
});
