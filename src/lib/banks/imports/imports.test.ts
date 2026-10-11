import { readFileSync } from "node:fs";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../tests/db";
import type { Viewer } from "@/lib/access";
import type { Db } from "@/lib/db";
import {
  accounts,
  balances,
  households,
  imports,
  members,
  transactions,
  users,
} from "@/lib/db/schema";
import {
  checkImport,
  cleanNewAccount,
  importableAccounts,
  looksLikeAnotherBank,
  recentImports,
  runImport,
  type ImportCheck,
  type ImportDone,
  type ImportProblem,
  type ImportRequest,
} from ".";

/**
 * Olive (Owner) and Pat (Partner). Olive has an everyday account at one bank and a joint account
 * at another. Pat has a private account, an account shared with Olive, and an archived one. Zed
 * lives in another household.
 */
const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  away: "00000000-0000-4000-8000-000000000002",
  olive: "00000000-0000-4000-8000-0000000000a1",
  pat: "00000000-0000-4000-8000-0000000000a2",
  zed: "00000000-0000-4000-8000-0000000000a3",
};
const A = {
  everyday: "00000000-0000-4000-8000-000000000b01",
  joint: "00000000-0000-4000-8000-000000000b02",
  patPrivate: "00000000-0000-4000-8000-000000000b03",
  patShared: "00000000-0000-4000-8000-000000000b04",
  patArchived: "00000000-0000-4000-8000-000000000b05",
  olivePlain: "00000000-0000-4000-8000-000000000b06",
  oliveOfx: "00000000-0000-4000-8000-000000000b07",
};

const olive: Viewer = { memberId: ids.olive, householdId: ids.home };
const pat: Viewer = { memberId: ids.pat, householdId: ids.home };
const zed: Viewer = { memberId: ids.zed, householdId: ids.away };

const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/files/${name}`));
const request = (accountId: string, name: string, extra: Partial<ImportRequest> = {}) => ({
  target: { accountId },
  filename: name,
  bytes: fixture(name),
  ...extra,
});

function checked(result: ImportCheck | ImportProblem): ImportCheck {
  if (!result.ok) throw new Error(`expected a check, got: ${result.error}`);
  return result;
}
function done(result: ImportDone | ImportProblem): ImportDone {
  if (!result.ok) throw new Error(`expected an import, got: ${result.error}`);
  return result;
}

const rowsIn = (accountId: string) =>
  db.select().from(transactions).where(eq(transactions.accountId, accountId));

/** Midday on 5 September in Sydney, two days after the files' last rows. */
const NOW = new Date("2026-09-05T02:00:00Z");

const balancesOf = (accountId: string) =>
  db
    .select({
      date: balances.date,
      balanceCents: balances.balanceCents,
      workedOut: balances.workedOut,
    })
    .from(balances)
    .where(eq(balances.accountId, accountId))
    .orderBy(asc(balances.date));

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
  const account = (id: string, owner: string, name: string, institution: string | null) => ({
    id,
    householdId: ids.home,
    ownerMemberId: owner,
    name,
    institution,
  });
  await db
    .insert(accounts)
    .values([
      account(A.everyday, ids.olive, "Everyday", "Westpac"),
      { ...account(A.joint, ids.olive, "Joint", "ANZ"), isJoint: true, visibility: "shared" },
      account(A.patPrivate, ids.pat, "Pat's everyday", "Example Bank"),
      { ...account(A.patShared, ids.pat, "Pat's savings", "Example Bank"), visibility: "shared" },
      { ...account(A.patArchived, ids.pat, "Old account", null), archived: true },
      account(A.olivePlain, ids.olive, "Spending", null),
      account(A.oliveOfx, ids.olive, "Bills", null),
    ]);
});
afterAll(async () => close());

describe("importableAccounts", () => {
  it("offers your own accounts and joint ones, never a partner's own or archived ones", async () => {
    const names = async (viewer: Viewer) =>
      (await importableAccounts(db, viewer)).map((a) => a.name).sort();
    expect(await names(olive)).toEqual(["Bills", "Everyday", "Joint", "Spending"]);
    expect(await names(pat)).toEqual(["Joint", "Pat's everyday", "Pat's savings"]);
    expect(await names(zed)).toEqual([]);
  });
});

describe("checking a file", () => {
  it("says what the file holds and saves nothing", async () => {
    const check = checked(await checkImport(db, olive, request(A.everyday, "westpac.csv")));
    expect(check).toMatchObject({
      file: { name: "westpac.csv", format: "csv" },
      accountName: "Everyday",
      mismatch: false,
      canChangeColumns: true,
      needsCheck: false,
      problem: null,
      rows: 4,
      from: "2026-09-01",
      to: "2026-09-03",
      fresh: 4,
      here: 0,
      transfers: 0,
      sorted: 0,
      toCheck: 4,
      sorts: [{ kind: "check", rows: 4 }],
      balance: { date: "2026-09-03", balanceCents: 1904_35 },
    });
    expect(check.file.size).toBe(fixture("westpac.csv").length);
    expect(check.columns.map((c) => c.role)).toEqual([
      "ignore",
      "date",
      "description",
      "debit",
      "credit",
      "balance",
      "ignore",
      "ignore",
    ]);
    // Oldest first, keeping the file's order within a day.
    expect(check.preview.map((row) => [row.date, row.amountCents, row.status])).toEqual([
      ["2026-09-01", -18_99, "new"],
      ["2026-09-01", -50_00, "new"],
      ["2026-09-02", 2450_00, "new"],
      ["2026-09-03", -31_60, "new"],
    ]);
    expect(check.preview[0]).toMatchObject({ name: null, category: null });
    expect(check.firstNew).toHaveLength(4);
    expect(check.firstHere).toEqual([]);
    expect(await rowsIn(A.everyday)).toEqual([]);
  });

  it("warns when the file looks like it's from another bank than the account", async () => {
    expect(checked(await checkImport(db, olive, request(A.joint, "westpac.csv"))).mismatch).toBe(
      true,
    );
    expect(checked(await checkImport(db, olive, request(A.everyday, "anz.csv"))).mismatch).toBe(
      true,
    );
    expect(checked(await checkImport(db, olive, request(A.joint, "anz.csv"))).mismatch).toBe(false);
    // Standard formats, and accounts that don't say their bank, never warn.
    expect(
      checked(await checkImport(db, olive, request(A.joint, "statement-sgml.ofx"))).mismatch,
    ).toBe(false);
    expect(checked(await checkImport(db, olive, request(A.olivePlain, "anz.csv"))).mismatch).toBe(
      false,
    );
  });

  it("refuses accounts the member can't import into", async () => {
    const refused = { ok: false, error: "Pick the account this file is from." };
    expect(await checkImport(db, olive, request(A.patPrivate, "anz.csv"))).toEqual(refused);
    expect(await checkImport(db, olive, request(A.patShared, "anz.csv"))).toEqual(refused);
    expect(await checkImport(db, pat, request(A.patArchived, "anz.csv"))).toEqual(refused);
    expect(await checkImport(db, zed, request(A.joint, "anz.csv"))).toEqual(refused);
    expect(await runImport(db, zed, request(A.joint, "anz.csv"))).toEqual(refused);
  });

  it("passes on the file reader's plain words for files it can't read", async () => {
    const bytes = new TextEncoder().encode("hello");
    expect(
      await checkImport(db, olive, { target: { accountId: A.everyday }, filename: "x.csv", bytes }),
    ).toEqual({
      ok: false,
      error:
        "This file doesn't look like a bank export. Download a CSV, OFX or QIF file from your bank's website and try again.",
    });
    expect(
      await checkImport(db, olive, {
        target: { accountId: A.everyday },
        filename: "big.csv",
        bytes: new Uint8Array(4 * 1024 * 1024 + 1),
      }),
    ).toEqual({
      ok: false,
      error: "This file is bigger than 4 MB. Export a shorter date range and try again.",
    });
  });

  it("reads a CSV again with the person's choice of columns, and says what's missing", async () => {
    const guess = checked(await checkImport(db, olive, request(A.olivePlain, "other-bank.csv")));
    expect(guess).toMatchObject({ needsCheck: true, problem: null, rows: 3 });

    const roles = guess.columns.map((c) => c.role);
    const noDate = roles.map((role) => (role === "date" ? "ignore" : role));
    const missing = checked(
      await checkImport(db, olive, request(A.olivePlain, "other-bank.csv", { columns: noDate })),
    );
    expect(missing).toMatchObject({ rows: 0, fresh: 0, problem: expect.stringMatching(/date/i) });
    expect(
      await runImport(db, olive, request(A.olivePlain, "other-bank.csv", { columns: noDate })),
    ).toMatchObject({ ok: false, error: missing.problem });

    const chosen = checked(
      await checkImport(db, olive, request(A.olivePlain, "other-bank.csv", { columns: roles })),
    );
    expect(chosen).toMatchObject({ needsCheck: false, problem: null, rows: 3 });
  });
});

describe("importing a file", () => {
  it("saves the Westpac CSV whole, and the same file again imports nothing", async () => {
    const first = done(await runImport(db, olive, request(A.everyday, "westpac.csv"), NOW));
    expect(first).toMatchObject({
      accountId: A.everyday,
      accountName: "Everyday",
      filename: "westpac.csv",
      rows: 4,
      imported: 4,
      skipped: 0,
      from: "2026-09-01",
      to: "2026-09-03",
      sorted: 0,
      toCheck: 4,
      transfers: 0,
    });

    const saved = await rowsIn(A.everyday);
    expect(saved).toHaveLength(4);
    for (const row of saved) {
      expect(row).toMatchObject({
        householdId: ids.home,
        source: "file",
        importId: first.importId,
        externalId: null,
        categoryId: null,
      });
      expect(row.dedupeKey).toMatch(/^2026-09-0\d\|-?\d+\|/);
    }
    const [record] = await db.select().from(imports).where(eq(imports.id, first.importId));
    expect(record).toMatchObject({
      accountId: A.everyday,
      memberId: ids.olive,
      filename: "westpac.csv",
      format: "csv",
      rows: 4,
      imported: 4,
      skipped: 0,
    });
    // The file's running balance for each day it covers, then carried on to today.
    expect(await balancesOf(A.everyday)).toEqual([
      { date: "2026-09-01", balanceCents: -514_05, workedOut: false },
      { date: "2026-09-02", balanceCents: 1935_95, workedOut: false },
      { date: "2026-09-03", balanceCents: 1904_35, workedOut: false },
      { date: "2026-09-04", balanceCents: 1904_35, workedOut: true },
      { date: "2026-09-05", balanceCents: 1904_35, workedOut: true },
    ]);

    const check = checked(await checkImport(db, olive, request(A.everyday, "westpac.csv")));
    expect(check).toMatchObject({ rows: 4, fresh: 0, here: 4 });
    expect(check.firstHere.map((row) => row.status)).toEqual(["here", "here"]);
    expect(check.preview.every((row) => row.status === "here")).toBe(true);

    const again = done(await runImport(db, olive, request(A.everyday, "westpac.csv"), NOW));
    expect(again).toMatchObject({ rows: 4, imported: 0, skipped: 4, toCheck: 0 });
    expect(await rowsIn(A.everyday)).toHaveLength(4);
  });

  it("saves OFX with the bank's ids and the balance it states, once", async () => {
    const first = done(await runImport(db, olive, request(A.oliveOfx, "statement-sgml.ofx"), NOW));
    expect(first).toMatchObject({ rows: 3, imported: 3, skipped: 0 });
    const saved = await rowsIn(A.oliveOfx);
    expect(saved.map((row) => row.externalId).sort()).toEqual([
      "2026090100001",
      "2026090200001",
      "2026090300001",
    ]);
    // The file states one balance; the days before it are worked back through its rows.
    expect(await balancesOf(A.oliveOfx)).toEqual([
      { date: "2026-09-01", balanceCents: -514_05, workedOut: true },
      { date: "2026-09-02", balanceCents: 1935_95, workedOut: true },
      { date: "2026-09-03", balanceCents: 1904_35, workedOut: false },
      { date: "2026-09-04", balanceCents: 1904_35, workedOut: true },
      { date: "2026-09-05", balanceCents: 1904_35, workedOut: true },
    ]);
    const again = done(await runImport(db, olive, request(A.oliveOfx, "statement-sgml.ofx"), NOW));
    expect(again).toMatchObject({ imported: 0, skipped: 3 });
    expect(await balancesOf(A.oliveOfx)).toHaveLength(5);
  });

  it("carries the balance on through a later file with no balance column", async () => {
    const first = done(
      await runImport(
        db,
        olive,
        {
          target: {
            newAccount: { name: "Bills", institution: null, kind: "everyday", isJoint: false },
          },
          filename: "other-bank.csv",
          bytes: fixture("other-bank.csv"),
        },
        NOW,
      ),
    );
    // The layout of the ANZ file: date, amount and description, with no balance.
    const later = new TextEncoder().encode(
      '07/09/2026,"5.00","REFUND CHEMIST"\n06/09/2026,"-10.00","CHEMIST NEWTOWN"\n',
    );
    done(
      await runImport(
        db,
        olive,
        { target: { accountId: first.accountId }, filename: "later.csv", bytes: later },
        new Date("2026-09-08T02:00:00Z"),
      ),
    );
    expect(await balancesOf(first.accountId)).toEqual([
      { date: "2026-09-01", balanceCents: -75_50, workedOut: false },
      { date: "2026-09-02", balanceCents: 124_50, workedOut: false },
      { date: "2026-09-03", balanceCents: 120_00, workedOut: false },
      { date: "2026-09-04", balanceCents: 120_00, workedOut: true },
      { date: "2026-09-05", balanceCents: 120_00, workedOut: true },
      { date: "2026-09-06", balanceCents: 110_00, workedOut: true },
      { date: "2026-09-07", balanceCents: 115_00, workedOut: true },
      { date: "2026-09-08", balanceCents: 115_00, workedOut: true },
    ]);
  });

  it("matches OFX rows by the bank's id even when their text changed", async () => {
    const ofx = new TextDecoder()
      .decode(fixture("statement-sgml.ofx"))
      .replace("NETFLIX.COM", "NETFLIX.COM SUBSCRIPTION");
    const bytes = new TextEncoder().encode(ofx);
    const check = checked(
      await checkImport(db, olive, {
        target: { accountId: A.oliveOfx },
        filename: "renamed.ofx",
        bytes,
      }),
    );
    expect(check).toMatchObject({ fresh: 0, here: 3 });
  });

  it("imports the ANZ CSV into a new file-only account", async () => {
    const result = done(
      await runImport(db, pat, {
        target: {
          newAccount: {
            name: "  Pat's   card ",
            institution: " ANZ ",
            kind: "credit",
            isJoint: false,
          },
        },
        filename: "anz.csv",
        bytes: fixture("anz.csv"),
      }),
    );
    expect(result).toMatchObject({ accountName: "Pat's card", imported: 3, skipped: 0 });
    const [made] = await db.select().from(accounts).where(eq(accounts.id, result.accountId));
    expect(made).toMatchObject({
      householdId: ids.home,
      ownerMemberId: ids.pat,
      name: "Pat's card",
      institution: "ANZ",
      kind: "credit",
      isJoint: false,
      visibility: "private",
      connectionId: null,
      manual: false,
    });
    expect(await rowsIn(result.accountId)).toHaveLength(3);
    // The CSV has no balance column, so no balance is saved.
    expect(
      await db.select().from(balances).where(eq(balances.accountId, result.accountId)),
    ).toEqual([]);
  });

  it("starts a new joint account as Shared", async () => {
    const result = done(
      await runImport(db, olive, {
        target: {
          newAccount: { name: "House", institution: null, kind: "mortgage", isJoint: true },
        },
        filename: "statement.qif",
        bytes: fixture("statement.qif"),
      }),
    );
    const [made] = await db.select().from(accounts).where(eq(accounts.id, result.accountId));
    expect(made).toMatchObject({ isJoint: true, visibility: "shared", kind: "mortgage" });
    expect(result.imported).toBe(3);
  });

  it("asks for a name before making a new account", async () => {
    const blank = {
      target: {
        newAccount: { name: "  ", institution: null, kind: "everyday" as const, isJoint: false },
      },
      filename: "anz.csv",
      bytes: fixture("anz.csv"),
    };
    // Checking the file can come first.
    expect(checked(await checkImport(db, olive, blank))).toMatchObject({
      accountName: "",
      fresh: 3,
    });
    expect(await runImport(db, olive, blank)).toEqual({
      ok: false,
      error: "Give the new account a name.",
    });
  });

  it("imports only what's new from a file that overlaps one already imported", async () => {
    const before = '05/09/2026,"-4.50","COFFEE CART NEWTOWN"\n';
    const twice = '04/09/2026,"-6.00","BAKERY ON KING"\n04/09/2026,"-6.00","BAKERY ON KING"\n';
    const anz = new TextDecoder().decode(fixture("anz.csv"));
    const target = { accountId: A.joint };
    const first = done(
      await runImport(db, olive, {
        target,
        filename: "anz-1.csv",
        bytes: new TextEncoder().encode(`04/09/2026,"-6.00","BAKERY ON KING"\n${anz}`),
      }),
    );
    expect(first).toMatchObject({ imported: 4, skipped: 0 });

    // The bakery twice on one morning: one is already here, so one more comes in.
    const overlap = new TextEncoder().encode(`${before}${twice}${anz}`);
    const check = checked(
      await checkImport(db, olive, { target, filename: "anz-2.csv", bytes: overlap }),
    );
    expect(check).toMatchObject({ rows: 6, fresh: 2, here: 4 });
    expect(check.firstNew.map((row) => [row.date, row.description])).toEqual([
      ["2026-09-04", "BAKERY ON KING"],
      ["2026-09-05", "COFFEE CART NEWTOWN"],
    ]);
    const second = done(
      await runImport(db, olive, { target, filename: "anz-2.csv", bytes: overlap }),
    );
    expect(second).toMatchObject({ rows: 6, imported: 2, skipped: 4 });

    const bakery = await db
      .select({ key: transactions.dedupeKey })
      .from(transactions)
      .where(and(eq(transactions.accountId, A.joint), eq(transactions.amountCents, -6_00)));
    expect(bakery.map((row) => row.key).sort()).toEqual([
      "2026-09-04|-600|BAKERY ON KING",
      "2026-09-04|-600|BAKERY ON KING#2",
    ]);
    const third = done(
      await runImport(db, olive, { target, filename: "anz-2.csv", bytes: overlap }),
    );
    expect(third).toMatchObject({ imported: 0, skipped: 6 });
  });
});

describe("recentImports", () => {
  it("lists the newest imports into accounts the member can import into", async () => {
    const mine = await recentImports(db, olive, 3);
    expect(mine.map((row) => [row.filename, row.accountName, row.imported, row.skipped])).toEqual([
      ["anz-2.csv", "Joint", 0, 6],
      ["anz-2.csv", "Joint", 2, 4],
      ["anz-1.csv", "Joint", 4, 0],
    ]);
    // Pat sees the joint accounts' imports and their own, never Olive's own accounts'.
    const theirs = await recentImports(db, pat, 20);
    expect(new Set(theirs.map((row) => row.accountName))).toEqual(
      new Set(["Joint", "House", "Pat's card"]),
    );
    expect(await recentImports(db, zed)).toEqual([]);
  });
});

describe("looksLikeAnotherBank", () => {
  it("warns only when the account names a different bank than the file's layout", () => {
    expect(looksLikeAnotherBank({ name: "Joint", institution: "ANZ" }, "westpac")).toBe(true);
    expect(looksLikeAnotherBank({ name: "ANZ Joint", institution: null }, "westpac")).toBe(true);
    expect(looksLikeAnotherBank({ name: "Everyday", institution: "Westpac" }, "westpac")).toBe(
      false,
    );
    expect(looksLikeAnotherBank({ name: "Everyday", institution: "St.George" }, "westpac")).toBe(
      false,
    );
    expect(looksLikeAnotherBank({ name: "Everyday", institution: "Westpac" }, "ofx")).toBe(false);
    expect(looksLikeAnotherBank({ name: "Everyday", institution: "Westpac" }, "other")).toBe(false);
  });
});

describe("cleanNewAccount", () => {
  it("tidies the details and keeps names short", () => {
    expect(
      cleanNewAccount({
        name: ` ${"x".repeat(80)} `,
        institution: "  ",
        kind: "crypto" as never,
        isJoint: "yes" as never,
      }),
    ).toEqual({ name: "x".repeat(60), institution: null, kind: "other", isJoint: false });
  });
});
