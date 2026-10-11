import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../tests/db";
import {
  activityPage,
  categoriseTransaction,
  dailySpending,
  markAsTransfer,
  notATransfer,
  sortShopAlways,
  type Viewer,
} from "@/lib/access";
import { checkImport, runImport } from "@/lib/banks/imports";
import type { Db } from "@/lib/db";
import { accounts, categories, households, members, transactions, users } from "@/lib/db/schema";
import { addStartingCategories, spentByCategory } from "../categories";
import {
  isCounted,
  pairTransfers,
  soundsLikeTransfer,
  transferScore,
  type TransferAccount,
  type TransferSide,
} from ".";

const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  away: "00000000-0000-4000-8000-000000000002",
  olive: "00000000-0000-4000-8000-0000000000a1",
  pat: "00000000-0000-4000-8000-0000000000a2",
  zed: "00000000-0000-4000-8000-0000000000a3",
  everyday: "00000000-0000-4000-8000-000000000b01",
  savings: "00000000-0000-4000-8000-000000000b02",
  holiday: "00000000-0000-4000-8000-000000000b03",
  visa: "00000000-0000-4000-8000-000000000b04",
  patPrivate: "00000000-0000-4000-8000-000000000b05",
  zedEveryday: "00000000-0000-4000-8000-000000000b06",
};
const olive: Viewer = { memberId: ids.olive, householdId: ids.home };
const zed: Viewer = { memberId: ids.zed, householdId: ids.away };

const account = (
  id: string,
  name: string,
  kind: string,
  more: Partial<TransferAccount> = {},
): TransferAccount => ({
  id,
  name,
  kind,
  ownerMemberId: ids.olive,
  isJoint: false,
  visibility: "shared",
  ...more,
});
const ACCOUNTS = new Map(
  [
    account(ids.everyday, "Everyday", "everyday"),
    account(ids.savings, "Savings", "savings", { visibility: "private" }),
    account(ids.holiday, "Holiday", "savings"),
    account(ids.visa, "Visa", "credit"),
    account(ids.patPrivate, "Pat's", "everyday", { ownerMemberId: ids.pat, visibility: "private" }),
  ].map((a) => [a.id, a]),
);
const accountOf = (id: string) => ACCOUNTS.get(id);

let n = 0;
const side = (
  accountId: string,
  date: string,
  amountCents: number,
  description: string,
  fresh = true,
): TransferSide => ({ key: `row-${++n}`, accountId, date, amountCents, description, fresh });
const described = (pairs: [TransferSide, TransferSide][]) =>
  pairs.map(([out, into]) => [out.description, into.description]);

describe("matching transfers", () => {
  it("pairs two equal transfers on the same day by the account each one names", () => {
    const pairs = pairTransfers(
      [
        side(ids.everyday, "2026-09-01", -500_00, "TRANSFER TO HOLIDAY"),
        side(ids.everyday, "2026-09-01", -500_00, "TRANSFER TO SAVINGS"),
        side(ids.savings, "2026-09-01", 500_00, "TRANSFER FROM EVERYDAY"),
        side(ids.holiday, "2026-09-01", 500_00, "TRANSFER FROM EVERYDAY"),
      ],
      accountOf,
    );
    expect(described(pairs).sort()).toEqual([
      ["TRANSFER TO HOLIDAY", "TRANSFER FROM EVERYDAY"],
      ["TRANSFER TO SAVINGS", "TRANSFER FROM EVERYDAY"],
    ]);
    const into = pairs.map(([out, into]) => [out.description, into.accountId]);
    expect(into).toContainEqual(["TRANSFER TO HOLIDAY", ids.holiday]);
    expect(into).toContainEqual(["TRANSFER TO SAVINGS", ids.savings]);
  });

  it("puts each row in at most one pair when two transfers look the same", () => {
    const sides = [
      side(ids.everyday, "2026-09-01", -200_00, "ONLINE BANKING TRANSFER"),
      side(ids.everyday, "2026-09-01", -200_00, "ONLINE BANKING TRANSFER"),
      side(ids.savings, "2026-09-01", 200_00, "ONLINE BANKING TRANSFER"),
      side(ids.savings, "2026-09-02", 200_00, "ONLINE BANKING TRANSFER"),
      side(ids.savings, "2026-09-03", 200_00, "ONLINE BANKING TRANSFER"),
    ];
    const pairs = pairTransfers(sides, accountOf);
    expect(pairs).toHaveLength(2);
    const used = pairs.flat().map((s) => s.key);
    expect(new Set(used).size).toBe(4);
    // The closest days win, so the one two days later is left over.
    expect(pairs.map(([, into]) => into.date).sort()).toEqual(["2026-09-01", "2026-09-02"]);
  });

  it("leaves a payment that only looks like a transfer alone", () => {
    expect(soundsLikeTransfer("OSKO PAYMENT TO J SMITH")).toBe(true);
    // Nothing on the other side: it's money paid to someone else.
    expect(
      pairTransfers(
        [side(ids.everyday, "2026-09-01", -50_00, "OSKO PAYMENT TO J SMITH")],
        accountOf,
      ),
    ).toEqual([]);
    // The same amount landing in savings with nothing else in common is a coincidence.
    expect(
      pairTransfers(
        [
          side(ids.everyday, "2026-09-01", -50_00, "OSKO PAYMENT TO J SMITH"),
          side(ids.savings, "2026-09-02", 50_00, "REFUND KMART 1043"),
        ],
        accountOf,
      ),
    ).toEqual([]);
    // Same amount and day, but nothing says transfer.
    expect(
      pairTransfers(
        [
          side(ids.everyday, "2026-09-01", -20_00, "KMART 1043 BONDI"),
          side(ids.visa, "2026-09-01", 20_00, "REFUND WOOLWORTHS 0099"),
        ],
        accountOf,
      ),
    ).toEqual([]);
  });

  it("pairs a card repayment", () => {
    const pairs = pairTransfers(
      [
        side(ids.everyday, "2026-09-10", -1_234_56, "PAYMENT TO VISA 4512"),
        side(ids.visa, "2026-09-11", 1_234_56, "PAYMENT RECEIVED THANK YOU"),
      ],
      accountOf,
    );
    expect(described(pairs)).toEqual([["PAYMENT TO VISA 4512", "PAYMENT RECEIVED THANK YOU"]]);
    // Into a card with one other sign is enough.
    expect(
      pairTransfers(
        [
          side(ids.everyday, "2026-09-10", -300_00, "BPAY 0000123 VISA"),
          side(ids.visa, "2026-09-12", 300_00, "PAYMENT - THANKYOU"),
        ],
        accountOf,
      ),
    ).toHaveLength(1);
  });

  it("needs the same amount, within three days, between accounts one person could move", () => {
    const out = side(ids.everyday, "2026-09-01", -100_00, "TRANSFER TO SAVINGS");
    expect(
      transferScore(out, side(ids.savings, "2026-09-04", 100_00, "TRANSFER"), accountOf),
    ).not.toBeNull();
    expect(
      transferScore(out, side(ids.savings, "2026-09-05", 100_00, "TRANSFER"), accountOf),
    ).toBeNull();
    expect(
      transferScore(out, side(ids.savings, "2026-09-01", 100_01, "TRANSFER"), accountOf),
    ).toBeNull();
    expect(
      transferScore(out, side(ids.everyday, "2026-09-01", 100_00, "TRANSFER"), accountOf),
    ).toBeNull();
    // A partner's private account is left to project 07.
    expect(
      transferScore(
        out,
        side(ids.patPrivate, "2026-09-01", 100_00, "TRANSFER FROM OLIVE"),
        accountOf,
      ),
    ).toBeNull();
    // Rows already here never pair with each other again.
    expect(
      pairTransfers(
        [
          side(ids.everyday, "2026-09-01", -100_00, "TRANSFER TO SAVINGS", false),
          side(ids.savings, "2026-09-01", 100_00, "TRANSFER FROM EVERYDAY", false),
        ],
        accountOf,
      ),
    ).toEqual([]);
    // By hand, the words don't matter.
    expect(
      transferScore(
        side(ids.everyday, "2026-09-01", -75_00, "J SMITH"),
        side(ids.savings, "2026-09-01", 75_00, "J SMITH"),
        accountOf,
        true,
      ),
    ).not.toBeNull();
  });

  it("counts only money that isn't a transfer", () => {
    expect(isCounted({ paired: false, kind: "spending" })).toBe(true);
    expect(isCounted({ paired: false, kind: undefined })).toBe(true);
    expect(isCounted({ paired: true, kind: "spending" })).toBe(false);
    expect(isCounted({ paired: false, kind: "transfer" })).toBe(false);
  });
});

/** A made-up bank CSV in the date, amount, description shape, newest first. */
const csv = (accountId: string, rows: [date: string, amount: string, description: string][]) => ({
  target: { accountId },
  filename: "statement.csv",
  bytes: new TextEncoder().encode(rows.map((row) => row.map((v) => `"${v}"`).join(",")).join("\n")),
});
const NOW = new Date("2026-09-20T02:00:00Z");

let db: Db;
let close: () => Promise<void>;
let category: Record<string, string>;

const one = async (accountId: string, descriptionRaw: string) => {
  const [row] = await db
    .select({
      id: transactions.id,
      categoryId: transactions.categoryId,
      transferGroupId: transactions.transferGroupId,
    })
    .from(transactions)
    .where(
      and(eq(transactions.accountId, accountId), eq(transactions.descriptionRaw, descriptionRaw)),
    );
  return row;
};
const imported = async (accountId: string, rows: Parameters<typeof csv>[1]) => {
  const result = await runImport(db, olive, csv(accountId, rows), NOW);
  if (!result.ok) throw new Error(result.error);
  return result;
};
const spentOn = async (date: string) =>
  (await dailySpending(db, olive, "household", { from: date, to: date })).days[0]?.cents ?? 0;

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
  const mine = { householdId: ids.home, ownerMemberId: ids.olive };
  await db.insert(accounts).values([
    { ...mine, id: ids.everyday, name: "Everyday", kind: "everyday", visibility: "shared" },
    { ...mine, id: ids.savings, name: "Savings", kind: "savings", visibility: "private" },
    { ...mine, id: ids.holiday, name: "Holiday", kind: "savings", visibility: "shared" },
    { ...mine, id: ids.visa, name: "Visa", kind: "credit", visibility: "shared" },
    {
      id: ids.patPrivate,
      householdId: ids.home,
      ownerMemberId: ids.pat,
      name: "Pat's",
      visibility: "private",
    },
    {
      id: ids.zedEveryday,
      householdId: ids.away,
      ownerMemberId: ids.zed,
      name: "Everyday",
      visibility: "shared",
    },
  ]);
  await addStartingCategories(db, ids.home);
  await addStartingCategories(db, ids.away);
  const list = await db.select().from(categories).where(eq(categories.householdId, ids.home));
  category = Object.fromEntries(list.map((c) => [c.name, c.id]));
});
afterAll(async () => close());

describe("transfers after an import", () => {
  it("pairs a transfer when its other side is imported later", async () => {
    await imported(ids.everyday, [
      ["02/09/2026", "-500.00", "TRANSFER TO SAVINGS REF 8812"],
      ["02/09/2026", "-42.10", "WOOLWORTHS 1187 SURRY HILLS AU"],
    ]);
    // Savings isn't in yet, so for now it's spending to check.
    const out = await one(ids.everyday, "TRANSFER TO SAVINGS REF 8812");
    expect(out).toMatchObject({ categoryId: null, transferGroupId: null });
    expect(await spentOn("2026-09-02")).toBe(542_10);

    const savings = csv(ids.savings, [["03/09/2026", "500.00", "DEPOSIT FROM EVERYDAY"]]);
    const check = await checkImport(db, olive, savings);
    if (!check.ok) throw new Error(check.error);
    expect(check.transfers).toBe(1);
    expect(check.preview[0]).toMatchObject({ status: "transfer", category: { name: "Transfers" } });
    // The check changes nothing.
    expect((await one(ids.everyday, "TRANSFER TO SAVINGS REF 8812")).transferGroupId).toBeNull();

    const result = await imported(ids.savings, [["03/09/2026", "500.00", "DEPOSIT FROM EVERYDAY"]]);
    expect(result).toMatchObject({ ok: true });
    const into = await one(ids.savings, "DEPOSIT FROM EVERYDAY");
    const outAfter = await one(ids.everyday, "TRANSFER TO SAVINGS REF 8812");
    expect(into.transferGroupId).not.toBeNull();
    expect(outAfter.transferGroupId).toBe(into.transferGroupId);
    expect(outAfter.categoryId).toBe(category["Transfers"]);
    expect(into.categoryId).toBe(category["Transfers"]);
    expect(await spentOn("2026-09-02")).toBe(42_10);
  });

  it("pairs a card repayment and leaves both sides out of every total", async () => {
    await imported(ids.everyday, [
      ["10/09/2026", "-1234.56", "PAYMENT TO VISA 4512"],
      ["10/09/2026", "-18.40", "SQ *BAR LUCA"],
    ]);
    await imported(ids.visa, [
      ["11/09/2026", "1234.56", "PAYMENT RECEIVED THANK YOU"],
      ["11/09/2026", "-60.00", "KMART 1043 BONDI"],
    ]);
    const out = await one(ids.everyday, "PAYMENT TO VISA 4512");
    const into = await one(ids.visa, "PAYMENT RECEIVED THANK YOU");
    expect(out.transferGroupId).not.toBeNull();
    expect(into.transferGroupId).toBe(out.transferGroupId);

    // The day totals, the week's spending and the colour spend all leave it out.
    expect(await spentOn("2026-09-10")).toBe(18_40);
    expect(await spentOn("2026-09-11")).toBe(60_00);
    const page = await activityPage(db, olive, "household");
    const shown = page.rows.filter((row) => row.id === out.id || row.id === into.id);
    expect(shown.map((row) => [row.notCounted, row.paired, row.category?.name])).toEqual([
      [true, true, "Transfers"],
      [true, true, "Transfers"],
    ]);
    const spent = await spentByCategory(db, ids.home);
    expect(spent.get(category["Transfers"])).toBeUndefined();
  });

  it("lets a rule mark a shop as not counted", async () => {
    await imported(ids.everyday, [["12/09/2026", "-250.00", "BPAY AUSSIE HOME LOANS"]]);
    const row = await one(ids.everyday, "BPAY AUSSIE HOME LOANS");
    const picked = await categoriseTransaction(db, olive, row.id, category["Transfers"]);
    if (!picked.ok || !picked.shop) throw new Error("no shop");
    expect(
      await sortShopAlways(db, olive, picked.shop.id, category["Transfers"], false),
    ).toMatchObject({
      ok: true,
    });
    await imported(ids.everyday, [["13/09/2026", "-250.00", "BPAY AUSSIE HOME LOANS 0912"]]);
    expect((await one(ids.everyday, "BPAY AUSSIE HOME LOANS 0912")).categoryId).toBe(
      category["Transfers"],
    );
    expect(await spentOn("2026-09-12")).toBe(0);
    expect(await spentOn("2026-09-13")).toBe(0);
  });
});

describe("fixing transfers by hand", () => {
  it("pairs a transfer by hand even when the words don't say so", async () => {
    await imported(ids.everyday, [["15/09/2026", "-75.00", "J SMITH"]]);
    await imported(ids.holiday, [["15/09/2026", "75.00", "J SMITH"]]);
    const out = await one(ids.everyday, "J SMITH");
    const into = await one(ids.holiday, "J SMITH");
    expect(out.transferGroupId).toBeNull();

    const marked = await markAsTransfer(db, olive, out.id);
    expect(marked).toEqual({
      ok: true,
      ids: [out.id, into.id],
      category: expect.objectContaining({ name: "Transfers", kind: "transfer" }),
      paired: true,
    });
    const after = await db
      .select({ group: transactions.transferGroupId, categoryId: transactions.categoryId })
      .from(transactions)
      .where(inArray(transactions.id, [out.id, into.id]));
    expect(new Set(after.map((row) => row.group)).size).toBe(1);
    expect(after.every((row) => row.group && row.categoryId === category["Transfers"])).toBe(true);
    // Sending it twice changes nothing.
    expect(await markAsTransfer(db, olive, out.id)).toMatchObject({ ok: true, paired: true });
    expect(await spentOn("2026-09-15")).toBe(0);
  });

  it("puts a transfer with no other side in Transfers on its own", async () => {
    await imported(ids.everyday, [["16/09/2026", "-90.00", "CASH OUT ATM 22"]]);
    const row = await one(ids.everyday, "CASH OUT ATM 22");
    expect(await markAsTransfer(db, olive, row.id)).toMatchObject({
      ok: true,
      ids: [row.id],
      paired: false,
    });
    expect(await one(ids.everyday, "CASH OUT ATM 22")).toMatchObject({
      categoryId: category["Transfers"],
      transferGroupId: null,
    });
    expect(await spentOn("2026-09-16")).toBe(0);
  });

  it("takes both sides out with Not a transfer, and they don't pair again", async () => {
    const out = await one(ids.everyday, "PAYMENT TO VISA 4512");
    const into = await one(ids.visa, "PAYMENT RECEIVED THANK YOU");
    const result = await notATransfer(db, olive, into.id);
    expect(result).toMatchObject({ ok: true, category: null, paired: false });
    if (!result.ok) throw new Error(result.error);
    expect(result.ids.sort()).toEqual([out.id, into.id].sort());
    expect(await one(ids.everyday, "PAYMENT TO VISA 4512")).toMatchObject({
      categoryId: null,
      transferGroupId: null,
    });
    expect(await spentOn("2026-09-10")).toBe(1_234_56 + 18_40);

    // Importing the same files again finds nothing new, so nothing pairs them.
    await imported(ids.visa, [["11/09/2026", "1234.56", "PAYMENT RECEIVED THANK YOU"]]);
    expect((await one(ids.visa, "PAYMENT RECEIVED THANK YOU")).transferGroupId).toBeNull();
  });

  it("only changes rows the person can see in full", async () => {
    const row = await one(ids.everyday, "SQ *BAR LUCA");
    expect(await markAsTransfer(db, zed, row.id)).toEqual({
      ok: false,
      error: "That transaction isn't one you can change.",
    });
    expect(await notATransfer(db, zed, row.id)).toMatchObject({ ok: false });
    const [hidden] = await db
      .insert(transactions)
      .values({
        householdId: ids.home,
        accountId: ids.patPrivate,
        date: "2026-09-17",
        amountCents: 40_00,
        descriptionRaw: "TRANSFER FROM OLIVE",
        source: "file",
      })
      .returning();
    expect(await markAsTransfer(db, olive, hidden.id)).toMatchObject({ ok: false });

    // Olive's side never pairs with Pat's private account, even by hand.
    await imported(ids.everyday, [["17/09/2026", "-40.00", "TRANSFER TO PAT"]]);
    const mine = await one(ids.everyday, "TRANSFER TO PAT");
    expect(await markAsTransfer(db, olive, mine.id)).toMatchObject({
      ok: true,
      ids: [mine.id],
      paired: false,
    });
  });
});
