import { and, asc, eq, gte, inArray, lte, max, notInArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { incomes, members, merchants, transactions } from "@/lib/db/schema";
import { addDays, isPlainDate, parts, type PlainDate } from "@/lib/money";
import { PAY_FREQUENCIES, type PayFrequency, type PaySchedule } from "@/lib/money/paydays";
import { findPays, payLookbackFrom, PAY_MIN_CENTS, type FoundPay } from "@/lib/sorting/paydays";
import { countedMoney } from "@/lib/sorting/transfers";
import { loose, shopFor } from "@/lib/sorting/merchants/clean";
import { scopeFor, type Viewer } from "./accounts";
import { INCOME_NAME_MAX, INCOMES_MAX } from "./limits";

/**
 * Each person's incomes: when they're paid, how much and into which account, from "When are you
 * paid?". They're the person's own, so no one else reads or changes them here.
 */

export type BudgetsRun = "monthly" | "payday" | "weekly";

export const BUDGETS_RUN: readonly BudgetsRun[] = ["monthly", "payday", "weekly"];

export type Income = PaySchedule & {
  id: string;
  label: string;
  amountCents: number;
  /** The account it comes into, or null when it isn't one the app has. */
  accountId: string | null;
};

/** A person's pay as they've set it: their incomes and how their budgets run. */
export type Paydays = { incomes: Income[]; budgetsRun: BudgetsRun };

async function memberRow(db: Db, viewer: Viewer) {
  const [row] = await db
    .select({ id: members.id, budgetsRun: members.budgetsRun })
    .from(members)
    .where(and(eq(members.id, viewer.memberId), eq(members.householdId, viewer.householdId)));
  return row ?? null;
}

/** The viewer's incomes, in the order they were added, and how their budgets run. */
export async function paydaysOf(db: Db, viewer: Viewer): Promise<Paydays> {
  const member = await memberRow(db, viewer);
  if (!member) return { incomes: [], budgetsRun: "monthly" };
  const rows = await db
    .select({
      id: incomes.id,
      label: incomes.label,
      amountCents: incomes.amountCents,
      accountId: incomes.accountId,
      frequency: incomes.frequency,
      anchorDate: incomes.anchorDate,
      secondDay: incomes.secondDay,
    })
    .from(incomes)
    .where(eq(incomes.memberId, viewer.memberId))
    .orderBy(asc(incomes.createdAt), asc(incomes.id));
  return { incomes: rows, budgetsRun: member.budgetsRun };
}

/** The accounts a person's pay can come into: their own and joint ones they see in full. */
async function payAccounts(db: Db, viewer: Viewer): Promise<string[]> {
  const { accounts } = await scopeFor(db, viewer, "household");
  return accounts
    .filter((account) => account.access === "full" && account.whose !== "partner")
    .map((account) => account.id);
}

/**
 * Regular pay the app can see in the viewer's own and joint accounts over the last 3 months,
 * biggest first. Transfers between the household's accounts and pending rows aren't pay.
 */
export async function paySuggestions(
  db: Db,
  viewer: Viewer,
  today: PlainDate,
): Promise<FoundPay[]> {
  const ids = await payAccounts(db, viewer);
  if (ids.length === 0) return [];
  const mine = and(
    eq(transactions.householdId, viewer.householdId),
    inArray(transactions.accountId, ids),
  );
  const [[{ lastDay }], rows] = await Promise.all([
    db
      .select({ lastDay: max(transactions.date) })
      .from(transactions)
      .where(and(mine, lte(transactions.date, today))),
    db
      .select({
        date: transactions.date,
        amountCents: transactions.amountCents,
        accountId: transactions.accountId,
        description: transactions.descriptionRaw,
        shop: merchants.displayName,
      })
      .from(transactions)
      .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
      .where(
        and(
          mine,
          gte(transactions.date, payLookbackFrom(today)),
          lte(transactions.date, today),
          gte(transactions.amountCents, PAY_MIN_CENTS),
          eq(transactions.pending, false),
          countedMoney(),
        ),
      ),
  ]);
  const deposits = rows.map((row) => {
    const shop = shopFor(row.description);
    return {
      date: row.date,
      amountCents: row.amountCents,
      accountId: row.accountId,
      payer: shop?.matchText ?? loose(row.description),
      payerName: row.shop ?? shop?.name ?? row.description,
    };
  });
  return findPays(deposits, today, lastDay ?? today);
}

/** An income as the screen sends it. `id` is set for one that's already saved. */
export type IncomeDraft = Omit<Income, "id"> & { id: string | null };

export type PaydaysSaved = { ok: true; paydays: Paydays } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An income's name as it's kept: spaces tidied. */
export const tidyIncomeName = (name: string) => name.replace(/\s+/g, " ").trim();

/** What's wrong with an income, or null when it can be saved. */
export function incomeProblem(draft: IncomeDraft, today: PlainDate): string | null {
  const name = tidyIncomeName(draft.label);
  if (!name) return "Give each income a name.";
  if (name.length > INCOME_NAME_MAX) return `Keep a name to ${INCOME_NAME_MAX} characters.`;
  if (!Number.isSafeInteger(draft.amountCents) || draft.amountCents <= 0)
    return `Say how much "${name}" brings in each payday.`;
  if (draft.amountCents > 100_000_000) return `That's a lot for one payday. Check "${name}".`;
  if (!PAY_FREQUENCIES.includes(draft.frequency)) return `Pick how often "${name}" comes in.`;
  if (
    !isPlainDate(draft.anchorDate) ||
    draft.anchorDate < addDays(today, -400) ||
    draft.anchorDate > addDays(today, 400)
  )
    return `Pick the next payday for "${name}".`;
  if (draft.frequency === "twice_monthly") {
    const second = draft.secondDay;
    if (second === null || !Number.isInteger(second) || second < 1 || second > 31)
      return `Pick both days of the month "${name}" comes in.`;
    if (second === parts(draft.anchorDate).day) return `Pick two different days for "${name}".`;
  }
  return null;
}

/**
 * Saves the viewer's incomes and how their budgets run, replacing what they had: incomes left out
 * are removed, ones with an id are changed and the rest are added.
 */
export async function savePaydays(
  db: Db,
  viewer: Viewer,
  input: { incomes: readonly IncomeDraft[]; budgetsRun: BudgetsRun },
  today: PlainDate,
): Promise<PaydaysSaved> {
  if (!(await memberRow(db, viewer))) return { ok: false, error: "You can't change paydays here." };
  if (input.incomes.length > INCOMES_MAX)
    return { ok: false, error: `You can have up to ${INCOMES_MAX} incomes.` };
  if (!BUDGETS_RUN.includes(input.budgetsRun))
    return { ok: false, error: "Pick how your budgets should run." };
  if (input.budgetsRun === "payday" && input.incomes.length === 0)
    return { ok: false, error: "Add your pay first, or pick monthly or weekly budgets." };
  for (const draft of input.incomes) {
    const problem = incomeProblem(draft, today);
    if (problem) return { ok: false, error: problem };
  }
  // An account the person can't see in full, or that isn't theirs, is left off.
  const allowed = new Set(await payAccounts(db, viewer));

  const rows = input.incomes.map((draft) => ({
    id: draft.id && UUID.test(draft.id) ? draft.id.toLowerCase() : null,
    label: tidyIncomeName(draft.label),
    amountCents: draft.amountCents,
    accountId: draft.accountId && allowed.has(draft.accountId) ? draft.accountId : null,
    frequency: draft.frequency as PayFrequency,
    anchorDate: draft.anchorDate,
    secondDay: draft.frequency === "twice_monthly" ? draft.secondDay : null,
  }));

  await db.transaction(async (tx) => {
    // One save at a time per person, so two can't both add past the limit.
    await tx
      .select({ id: members.id })
      .from(members)
      .where(eq(members.id, viewer.memberId))
      .for("update");
    const had = new Set(
      (
        await tx
          .select({ id: incomes.id })
          .from(incomes)
          .where(eq(incomes.memberId, viewer.memberId))
      ).map((row) => row.id),
    );
    const kept = rows.flatMap((row) => (row.id && had.has(row.id) ? [row.id] : []));
    await tx
      .delete(incomes)
      .where(
        and(
          eq(incomes.memberId, viewer.memberId),
          kept.length > 0 ? notInArray(incomes.id, kept) : undefined,
        ),
      );
    // New ones go after the ones already saved, in the order they're listed.
    const now = Date.now();
    for (const [i, { id, ...row }] of rows.entries()) {
      if (id && had.has(id))
        await tx
          .update(incomes)
          .set(row)
          .where(and(eq(incomes.id, id), eq(incomes.memberId, viewer.memberId)));
      else
        await tx.insert(incomes).values({
          ...row,
          householdId: viewer.householdId,
          memberId: viewer.memberId,
          createdAt: new Date(now + i),
        });
    }
    await tx
      .update(members)
      .set({ budgetsRun: input.budgetsRun })
      .where(eq(members.id, viewer.memberId));
  });
  return { ok: true, paydays: await paydaysOf(db, viewer) };
}
