import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import type { Db } from "@/lib/db";
import { accounts, households, members, transactions, users } from "@/lib/db/schema";
import { addDays } from "@/lib/money";
import { paydaysOf, paySuggestions, savePaydays, type IncomeDraft, type Viewer } from ".";

/**
 * Olive is paid fortnightly into Everyday, which she shares with Pat. Pat is paid monthly into his
 * private account. Money moved into the Joint account is a transfer, not pay.
 */
const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  olive: "00000000-0000-4000-8000-0000000000a1",
  pat: "00000000-0000-4000-8000-0000000000a2",
  everyday: "00000000-0000-4000-8000-000000000b01",
  joint: "00000000-0000-4000-8000-000000000b03",
  patPrivate: "00000000-0000-4000-8000-000000000b04",
};
const olive: Viewer = { memberId: ids.olive, householdId: ids.home };
const pat: Viewer = { memberId: ids.pat, householdId: ids.home };
const stranger: Viewer = {
  memberId: "00000000-0000-4000-8000-0000000000ff",
  householdId: ids.home,
};
const TODAY = "2026-10-11";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(households).values({ id: ids.home, name: "Home" });
  const [o, p] = await db
    .insert(users)
    .values([
      { name: "Olive", email: "olive@example.com" },
      { name: "Pat", email: "pat@example.com" },
    ])
    .returning();
  await db.insert(members).values([
    { id: ids.olive, householdId: ids.home, userId: o.id, role: "owner", displayName: "Olive" },
    { id: ids.pat, householdId: ids.home, userId: p.id, role: "partner", displayName: "Pat" },
  ]);
  const account = (id: string, owner: string, name: string, more: object = {}) => ({
    id,
    householdId: ids.home,
    ownerMemberId: owner,
    name,
    ...more,
  });
  await db
    .insert(accounts)
    .values([
      account(ids.everyday, ids.olive, "Everyday", { visibility: "shared" }),
      account(ids.joint, ids.olive, "Joint", { visibility: "shared", isJoint: true }),
      account(ids.patPrivate, ids.pat, "Pat's", { visibility: "private" }),
    ]);

  const row = (accountId: string, date: string, amountCents: number, descriptionRaw: string) => ({
    householdId: ids.home,
    accountId,
    date,
    amountCents,
    descriptionRaw,
    source: "file" as const,
  });
  const rows = [];
  for (let date = "2026-10-09", i = 0; date > "2026-06-01"; date = addDays(date, -14), i++) {
    // The reference number changes each time, as banks do.
    rows.push(row(ids.everyday, date, 326_000, `ACME PTY LTD SALARY 00981${i}`));
    const group = crypto.randomUUID();
    rows.push(
      { ...row(ids.everyday, date, -100_000, "TRANSFER TO JOINT"), transferGroupId: group },
      { ...row(ids.joint, date, 100_000, "TRANSFER FROM EVERYDAY"), transferGroupId: group },
    );
  }
  for (const date of ["2026-07-28", "2026-08-28", "2026-09-28"])
    rows.push(row(ids.patPrivate, date, 512_000, "PAY BIG CORP"));
  rows.push({ ...row(ids.everyday, "2026-10-10", 70_000, "REFUND"), pending: true });
  await db.insert(transactions).values(rows);
});

afterAll(async () => {
  await close();
});

describe("paySuggestions", () => {
  it("finds each person's own pay, and never a transfer", async () => {
    const [pay, ...others] = await paySuggestions(db, olive, TODAY);
    expect(others).toEqual([]);
    expect(pay).toMatchObject({
      frequency: "fortnightly",
      anchorDate: "2026-10-09",
      accountId: ids.everyday,
      amountCents: 326_000,
      next: "2026-10-23",
      payerName: "Acme Salary",
    });
    expect(pay.seen).toHaveLength(7);
  });

  it("leaves out pay into a partner's account, even one shared with you", async () => {
    const pays = await paySuggestions(db, pat, TODAY);
    expect(pays.map((found) => [found.accountId, found.frequency])).toEqual([
      [ids.patPrivate, "monthly"],
    ]);
    expect(await paySuggestions(db, stranger, TODAY)).toEqual([]);
  });
});

const draft = (more: Partial<IncomeDraft> = {}): IncomeDraft => ({
  id: null,
  label: "Your pay",
  amountCents: 326_000,
  accountId: ids.everyday,
  frequency: "fortnightly",
  anchorDate: "2026-10-09",
  secondDay: null,
  ...more,
});

describe("savePaydays", () => {
  it("saves a person's incomes in order, with how their budgets run", async () => {
    const saved = await savePaydays(
      db,
      olive,
      {
        incomes: [
          draft(),
          draft({ label: "  Weekend   shifts ", amountCents: 24_000, frequency: "weekly" }),
        ],
        budgetsRun: "payday",
      },
      TODAY,
    );
    expect(saved.ok).toBe(true);
    const mine = await paydaysOf(db, olive);
    expect(mine.budgetsRun).toBe("payday");
    expect(mine.incomes.map((income) => [income.label, income.frequency])).toEqual([
      ["Your pay", "fortnightly"],
      ["Weekend shifts", "weekly"],
    ]);
    expect(await paydaysOf(db, pat)).toEqual({ incomes: [], budgetsRun: "monthly" });
  });

  it("changes incomes kept by id and removes the ones left out", async () => {
    const [pay] = (await paydaysOf(db, olive)).incomes;
    const saved = await savePaydays(
      db,
      olive,
      {
        incomes: [
          { ...pay, amountCents: 340_000 },
          draft({
            label: "Rent from Sam",
            frequency: "twice_monthly",
            anchorDate: "2026-10-15",
            secondDay: 31,
          }),
        ],
        budgetsRun: "monthly",
      },
      TODAY,
    );
    expect(saved.ok).toBe(true);
    const { incomes } = await paydaysOf(db, olive);
    expect(incomes.map((income) => [income.id, income.label, income.amountCents])).toEqual([
      [pay.id, "Your pay", 340_000],
      [expect.any(String), "Rent from Sam", 326_000],
    ]);
    expect(incomes[1].secondDay).toBe(31);
  });

  it("says what's wrong instead of saving", async () => {
    const save = (incomes: IncomeDraft[], budgetsRun: "monthly" | "payday" = "monthly") =>
      savePaydays(db, olive, { incomes, budgetsRun }, TODAY);
    expect(await save([draft({ label: " " })])).toEqual({
      ok: false,
      error: "Give each income a name.",
    });
    expect(await save([draft({ amountCents: 0 })])).toMatchObject({ ok: false });
    expect(await save([draft({ anchorDate: "2030-01-01" })])).toEqual({
      ok: false,
      error: 'Pick the next payday for "Your pay".',
    });
    expect(
      await save([draft({ frequency: "twice_monthly", anchorDate: "2026-10-15", secondDay: 15 })]),
    ).toEqual({ ok: false, error: 'Pick two different days for "Your pay".' });
    expect(await save([], "payday")).toEqual({
      ok: false,
      error: "Add your pay first, or pick monthly or weekly budgets.",
    });
    expect(await save(Array.from({ length: 7 }, () => draft()))).toMatchObject({ ok: false });
    // Nothing changed.
    expect((await paydaysOf(db, olive)).incomes).toHaveLength(2);
  });

  it("keeps people's incomes apart", async () => {
    const [oliveFirst] = (await paydaysOf(db, olive)).incomes;
    // Pat can't change Olive's income by sending its id, or point his pay at her account.
    const saved = await savePaydays(
      db,
      pat,
      { incomes: [draft({ id: oliveFirst.id, label: "Pat's pay" })], budgetsRun: "monthly" },
      TODAY,
    );
    expect(saved.ok).toBe(true);
    const [patPay] = (await paydaysOf(db, pat)).incomes;
    expect(patPay).toMatchObject({ label: "Pat's pay", accountId: null });
    expect(patPay.id).not.toBe(oliveFirst.id);
    expect((await paydaysOf(db, olive)).incomes[0]).toEqual(oliveFirst);
    expect(
      await savePaydays(db, stranger, { incomes: [], budgetsRun: "monthly" }, TODAY),
    ).toMatchObject({ ok: false });
  });

  it("removes every income when none are sent", async () => {
    expect(await savePaydays(db, pat, { incomes: [], budgetsRun: "weekly" }, TODAY)).toMatchObject({
      ok: true,
      paydays: { incomes: [], budgetsRun: "weekly" },
    });
  });
});
