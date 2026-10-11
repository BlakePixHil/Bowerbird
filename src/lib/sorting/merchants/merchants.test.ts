import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../tests/db";
import { activityPage, type Viewer } from "@/lib/access";
import { checkImport, runImport } from "@/lib/banks/imports";
import type { Db } from "@/lib/db";
import {
  accounts,
  categories,
  households,
  members,
  merchants,
  transactions,
  users,
} from "@/lib/db/schema";
import { nameShops, renameShop, SHOP_NAME_MAX } from ".";

const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  away: "00000000-0000-4000-8000-000000000002",
  olive: "00000000-0000-4000-8000-0000000000a1",
  zed: "00000000-0000-4000-8000-0000000000a3",
  everyday: "00000000-0000-4000-8000-000000000b01",
  older: "00000000-0000-4000-8000-000000000b02",
  zedAccount: "00000000-0000-4000-8000-000000000b03",
};
const olive: Viewer = { memberId: ids.olive, householdId: ids.home };
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

/** Each row's shop name as Activity shows it, by its bank text, in Olive's everyday account. */
async function shown(): Promise<Record<string, string>> {
  const page = await activityPage(db, olive, "household");
  const rows = page.rows.filter((row) => row.account.id === ids.everyday);
  return Object.fromEntries(rows.map((row) => [row.description, row.shop]));
}
const shopsIn = (householdId: string) =>
  db
    .select({ id: merchants.id, matchText: merchants.matchText, name: merchants.displayName })
    .from(merchants)
    .where(eq(merchants.householdId, householdId));

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(households).values([
    { id: ids.home, name: "Home" },
    { id: ids.away, name: "Away" },
  ]);
  const [o, z] = await db
    .insert(users)
    .values([
      { name: "Olive", email: "olive@example.com" },
      { name: "Zed", email: "zed@example.com" },
    ])
    .returning();
  await db.insert(members).values([
    { id: ids.olive, householdId: ids.home, userId: o.id, role: "owner", displayName: "Olive" },
    { id: ids.zed, householdId: ids.away, userId: z.id, role: "owner", displayName: "Zed" },
  ]);
  await db.insert(accounts).values([
    { id: ids.everyday, householdId: ids.home, ownerMemberId: ids.olive, name: "Everyday" },
    { id: ids.older, householdId: ids.home, ownerMemberId: ids.olive, name: "Older" },
    { id: ids.zedAccount, householdId: ids.away, ownerMemberId: ids.zed, name: "Zed's" },
  ]);
});
afterAll(async () => close());

describe("shop names", () => {
  it("names each imported row's shop, with one shop for every variation of it", async () => {
    const result = await runImport(
      db,
      olive,
      csv([
        ["03/09/2026", "-31.60", "WOOLWORTHS 1187 SURRY HILLS AU"],
        ["02/09/2026", "-12.00", "SQ *BAR LUCA"],
        ["02/09/2026", "-8.40", "WOOLWORTHS METRO 2231"],
        ["01/09/2026", "-50.00", "1234567890"],
      ]),
      NOW,
    );
    expect(result.ok).toBe(true);
    expect(await shown()).toEqual({
      "WOOLWORTHS 1187 SURRY HILLS AU": "Woolworths",
      "SQ *BAR LUCA": "Bar Luca",
      "WOOLWORTHS METRO 2231": "Woolworths",
      "1234567890": "1234567890",
    });
    expect((await shopsIn(ids.home)).map((shop) => shop.name).sort()).toEqual([
      "Bar Luca",
      "Woolworths",
    ]);
    // Text with no name in it keeps no shop, and shows the bank's words.
    const unnamed = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.accountId, ids.everyday), isNull(transactions.merchantId)));
    expect(unnamed.map((row) => row.descriptionRaw)).toEqual(["1234567890"]);
  });

  it("names new shops in the check before importing, without saving them", async () => {
    const check = await checkImport(db, olive, csv([["04/09/2026", "-6.50", "ZLR*NEW PLACE"]]));
    if (!check.ok) throw new Error(check.error);
    expect(check.preview.map((row) => row.name)).toEqual(["New Place"]);
    expect(await shopsIn(ids.home)).toHaveLength(2);
  });

  it("shows a new name on every row from the shop, and on rows imported later", async () => {
    const woolworths = (await shopsIn(ids.home)).find((shop) => shop.matchText === "WOOLWORTHS")!;
    expect(await renameShop(db, olive, woolworths.id, "  Woolies   local ")).toEqual({
      ok: true,
      name: "Woolies local",
    });
    expect(await shown()).toEqual({
      "WOOLWORTHS 1187 SURRY HILLS AU": "Woolies local",
      "SQ *BAR LUCA": "Bar Luca",
      "WOOLWORTHS METRO 2231": "Woolies local",
      "1234567890": "1234567890",
    });

    const later = await runImport(
      db,
      olive,
      csv([["05/09/2026", "-22.10", "EFTPOS PURCHASE WOOLWORTHS 0099 BONDI NSW"]]),
      NOW,
    );
    expect(later.ok).toBe(true);
    expect((await shown())["EFTPOS PURCHASE WOOLWORTHS 0099 BONDI NSW"]).toBe("Woolies local");
    expect(await shopsIn(ids.home)).toHaveLength(2);
  });

  it("renames only the household's own shops, to a name", async () => {
    const [shop] = await shopsIn(ids.home);
    expect(await renameShop(db, zed, shop.id, "Mine now")).toEqual({
      ok: false,
      error: "That shop isn't in your household.",
    });
    expect(await renameShop(db, { ...zed, householdId: ids.home }, shop.id, "Mine now")).toEqual({
      ok: false,
      error: "That shop isn't in your household.",
    });
    expect(await renameShop(db, olive, shop.id, "   ")).toEqual({
      ok: false,
      error: "Give the shop a name.",
    });
    expect(await renameShop(db, olive, shop.id, "x".repeat(SHOP_NAME_MAX + 1))).toMatchObject({
      ok: false,
    });
    expect((await shopsIn(ids.home)).find((s) => s.id === shop.id)?.name).toBe(shop.name);
  });

  it("names the shops of rows that came in before, keeping their categories", async () => {
    const [groceries] = await db
      .insert(categories)
      .values({ householdId: ids.home, name: "Groceries" })
      .returning();
    const row = (accountId: string, householdId: string, date: string, descriptionRaw: string) => ({
      householdId,
      accountId,
      date,
      amountCents: -1000,
      descriptionRaw,
      source: "file" as const,
    });
    await db.insert(transactions).values([
      {
        ...row(ids.older, ids.home, "2026-08-01", "COLES 0456 NEWTOWN NSW"),
        categoryId: groceries.id,
      },
      row(ids.older, ids.home, "2026-08-02", "WOOLWORTHS 0412 GLEBE"),
      row(ids.older, ids.home, "2026-08-02", "SQ *BAR LUCA"),
      row(ids.older, ids.home, "2026-08-03", "KMART 1077 BROADWAY"),
      row(ids.older, ids.home, "2026-08-04", "000123"),
      row(ids.zedAccount, ids.away, "2026-08-04", "KMART 2210 PERTH WA"),
    ]);

    // Small pages, so it has to carry on from where each one ended.
    expect(await nameShops(db, { householdId: ids.home, pageRows: 2 })).toEqual({
      named: 4,
      left: false,
    });
    const older = await db
      .select({
        description: transactions.descriptionRaw,
        shop: merchants.displayName,
        categoryId: transactions.categoryId,
      })
      .from(transactions)
      .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
      .where(eq(transactions.accountId, ids.older));
    expect(Object.fromEntries(older.map((r) => [r.description, r.shop]))).toEqual({
      "COLES 0456 NEWTOWN NSW": "Coles",
      // The name Olive gave Woolworths carries over to its earlier rows too.
      "WOOLWORTHS 0412 GLEBE": "Woolies local",
      "SQ *BAR LUCA": "Bar Luca",
      "KMART 1077 BROADWAY": "Kmart",
      "000123": null,
    });
    expect(older.find((r) => r.description.startsWith("COLES"))?.categoryId).toBe(groceries.id);
    // Another household's rows wait for their own run, and get their own shops.
    expect(await shopsIn(ids.away)).toEqual([]);
    expect(await nameShops(db)).toEqual({ named: 1, left: false });
    expect((await shopsIn(ids.away)).map((shop) => shop.name)).toEqual(["Kmart"]);
  });

  it("stops when its time is up", async () => {
    let time = 0;
    const now = () => (time += 10_000);
    expect(await nameShops(db, { now })).toEqual({ named: 0, left: true });
  });
});
