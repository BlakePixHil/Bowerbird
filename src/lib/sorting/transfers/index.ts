import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, inArray, isNull, lte, notExists, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { accounts, categories, splits, transactions } from "@/lib/db/schema";
import { addDays, daysBetween, type PlainDate } from "@/lib/money";
import type { SortingRow, SortingStep } from "..";
import { loose } from "../merchants";

/** The two sides of a transfer are at most this many days apart. */
export const TRANSFER_DAYS = 3;

/**
 * Signs a pair needs before it's matched by itself. One sign alone, such as "OSKO PAYMENT TO J
 * SMITH" with the same amount landing elsewhere, is too often a payment to someone else.
 */
export const TRANSFER_SIGNS = 2;

/**
 * Money that counts toward spending and income totals: anything but a transfer between the
 * household's own accounts, matched as a pair or put in a transfer category. Every total in the
 * app uses this, in SQL here or as `notCounted` on a row (`spentBy` in `src/lib/money`).
 */
export function countedMoney() {
  return and(
    isNull(transactions.transferGroupId),
    or(
      isNull(transactions.categoryId),
      sql`not exists (select 1 from ${categories} where ${categories.id} = ${transactions.categoryId} and ${categories.kind} = 'transfer')`,
    ),
  );
}

/** Whether a row counts toward totals, the same rule as `countedMoney`. */
export const isCounted = (row: { paired: boolean; kind: string | null | undefined }) =>
  !row.paired && row.kind !== "transfer";

/** Words that say money is moving between accounts, or paying off a card. */
const HINTS = [
  "TRANSFER",
  "TFR",
  "XFER",
  "OSKO",
  "PAYID",
  "INTERNET BANKING",
  "ONLINE BANKING",
  "MOBILE BANKING",
  "PAYMENT TO",
  "PAYMENT FROM",
  "CREDIT CARD",
  "CARD PAYMENT",
  "CC PAYMENT",
  "PAYMENT RECEIVED",
  "THANK YOU",
  "THANKYOU",
  "TFER",
  "AUTOPAY",
  "REPAYMENT",
  "SWEEP",
].map(loose);

const has = (text: string, words: string) => ` ${text} `.includes(` ${words} `);

/** True when a bank's text sounds like a transfer or a card payment. */
export function soundsLikeTransfer(description: string): boolean {
  const text = loose(description);
  return HINTS.some((hint) => has(text, hint));
}

/** What pairing needs to know about an account. */
export type TransferAccount = {
  id: string;
  name: string;
  kind: string;
  ownerMemberId: string;
  isJoint: boolean;
  visibility: string;
};

/** A row that could be one side of a transfer. `fresh` rows are the ones just imported. */
export type TransferSide = {
  key: string;
  accountId: string;
  date: PlainDate;
  amountCents: number;
  description: string;
  fresh: boolean;
};

const owes = (kind: string) => kind === "credit" || kind === "loan" || kind === "mortgage";

/**
 * Money can be matched between two accounts when one person could move it themselves: the same
 * owner, a joint account, or both set to Shared. Moving money to a partner's private account is
 * left to project 07.
 */
function canPair(a: TransferAccount, b: TransferAccount): boolean {
  return (
    a.id !== b.id &&
    (a.ownerMemberId === b.ownerMemberId ||
      a.isJoint ||
      b.isJoint ||
      (a.visibility === "shared" && b.visibility === "shared"))
  );
}

const named = (text: string, name: string) => loose(name) !== "" && has(text, loose(name));

/**
 * How strongly a money-out and a money-in look like one transfer, or null when they can't be one.
 * They need the same amount, different accounts the household can pair, and dates at most
 * `TRANSFER_DAYS` apart. Without `byHand`, they also need `TRANSFER_SIGNS` of these: words on
 * either side that sound like a transfer, words on either side naming the other account, and money
 * going into a card or loan. More signs score higher, then closer dates.
 */
export function transferScore(
  out: TransferSide,
  into: TransferSide,
  accountOf: (id: string) => TransferAccount | undefined,
  byHand = false,
): number | null {
  if (out.amountCents >= 0 || into.amountCents !== -out.amountCents) return null;
  const from = accountOf(out.accountId);
  const to = accountOf(into.accountId);
  if (!from || !to || !canPair(from, to)) return null;
  const gap = Math.abs(daysBetween(out.date, into.date));
  if (gap > TRANSFER_DAYS) return null;

  const signs = [
    soundsLikeTransfer(out.description),
    soundsLikeTransfer(into.description),
    // "TRANSFER TO SAVINGS" going into the account called Savings.
    named(loose(out.description), to.name),
    named(loose(into.description), from.name),
    owes(to.kind) && !owes(from.kind),
  ].filter(Boolean).length;
  if (signs < TRANSFER_SIGNS && !byHand) return null;
  return signs + (TRANSFER_DAYS - gap) / (TRANSFER_DAYS + 1);
}

/**
 * Pairs money out with money in that look like one transfer, best match first, each row in at
 * most one pair. Every pair has at least one fresh row, so rows already here never pair with each
 * other again (someone may have said they're not a transfer).
 */
export function pairTransfers(
  sides: readonly TransferSide[],
  accountOf: (id: string) => TransferAccount | undefined,
): [out: TransferSide, into: TransferSide][] {
  const outs = sides.filter((side) => side.amountCents < 0);
  const ins = new Map<number, TransferSide[]>();
  for (const side of sides)
    if (side.amountCents > 0)
      ins.set(side.amountCents, [...(ins.get(side.amountCents) ?? []), side]);

  const options: { out: TransferSide; into: TransferSide; score: number; gap: number }[] = [];
  for (const out of outs)
    for (const into of ins.get(-out.amountCents) ?? []) {
      if (!out.fresh && !into.fresh) continue;
      const score = transferScore(out, into, accountOf);
      if (score !== null)
        options.push({ out, into, score, gap: Math.abs(daysBetween(out.date, into.date)) });
    }
  options.sort(
    (a, b) =>
      b.score - a.score ||
      a.gap - b.gap ||
      a.out.date.localeCompare(b.out.date) ||
      a.out.key.localeCompare(b.out.key) ||
      a.into.key.localeCompare(b.into.key),
  );

  const used = new Set<string>();
  const pairs: [TransferSide, TransferSide][] = [];
  for (const { out, into } of options) {
    if (used.has(out.key) || used.has(into.key)) continue;
    used.add(out.key);
    used.add(into.key);
    pairs.push([out, into]);
  }
  return pairs;
}

/** The household's accounts, for pairing. */
export async function transferAccounts(
  db: Db,
  householdId: string,
): Promise<Map<string, TransferAccount>> {
  const found = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      kind: accounts.kind,
      ownerMemberId: accounts.ownerMemberId,
      isJoint: accounts.isJoint,
      visibility: accounts.visibility,
    })
    .from(accounts)
    .where(eq(accounts.householdId, householdId));
  return new Map(found.map((account) => [account.id, account]));
}

/** The household's Transfers category: the first of kind transfer, or null if it has none. */
export async function transferCategory(
  db: Db,
  householdId: string,
): Promise<NonNullable<SortingRow["category"]> | null> {
  const [found] = await db
    .select({
      id: categories.id,
      name: categories.name,
      kind: categories.kind,
      icon: categories.icon,
      colourSlot: categories.colourSlot,
    })
    .from(categories)
    .where(
      and(
        eq(categories.householdId, householdId),
        eq(categories.kind, "transfer"),
        eq(categories.archived, false),
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.id))
    .limit(1);
  return found ?? null;
}

/** Rows already here that could be the other side: not paired, not split, not in another category. */
export function couldPair(db: Db) {
  return and(
    isNull(transactions.transferGroupId),
    or(
      isNull(transactions.categoryId),
      sql`exists (select 1 from ${categories} where ${categories.id} = ${transactions.categoryId} and ${categories.kind} = 'transfer')`,
    ),
    notExists(
      db.select({ id: splits.id }).from(splits).where(eq(splits.transactionId, transactions.id)),
    ),
  );
}

/**
 * The third sorting step: money out and money in of the same amount on two of the household's
 * accounts, within `TRANSFER_DAYS`, become a transfer. Both sides share a `transfer_group_id` and
 * go in Transfers, so they never count as spending or income. The other side can be a row that
 * came in earlier, so a transfer pairs up whichever account is imported second.
 */
export const matchTransfers: SortingStep = async ({ db, householdId, save }, rows) => {
  const fresh = rows.filter(
    (row) =>
      !row.transferGroupId &&
      row.amountCents !== 0 &&
      (!row.category || row.category.kind === "transfer"),
  );
  if (fresh.length === 0) return;
  const dates = fresh.map((row) => row.date).sort();
  const amounts = [...new Set(fresh.flatMap((row) => [row.amountCents, -row.amountCents]))];
  const freshIds = fresh.flatMap((row) => (row.id ? [row.id] : []));

  const earlier = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amountCents: transactions.amountCents,
      description: transactions.descriptionRaw,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        inArray(transactions.amountCents, amounts),
        gte(transactions.date, addDays(dates[0], -TRANSFER_DAYS)),
        lte(transactions.date, addDays(dates.at(-1)!, TRANSFER_DAYS)),
        couldPair(db),
      ),
    );
  const freshSet = new Set(freshIds);
  const sides: TransferSide[] = [
    ...fresh.map((row, i) => ({ ...row, key: row.id ?? `new-${i}`, fresh: true })),
    ...earlier
      .filter((row) => !freshSet.has(row.id))
      .map((row) => ({ ...row, key: row.id, fresh: false })),
  ];
  const accountMap = await transferAccounts(db, householdId);
  const pairs = pairTransfers(sides, (id) => accountMap.get(id));
  if (pairs.length === 0) return;

  const category = await transferCategory(db, householdId);
  const byKey = new Map(fresh.map((row, i) => [row.id ?? `new-${i}`, row]));
  for (const pair of pairs) {
    const group = randomUUID();
    for (const side of pair) {
      const row = byKey.get(side.key);
      if (row) {
        row.transferGroupId = group;
        if (category) row.category = { ...category };
      } else if (save) {
        await db
          .update(transactions)
          .set({ transferGroupId: group, ...(category ? { categoryId: category.id } : {}) })
          .where(
            and(
              eq(transactions.id, side.key),
              eq(transactions.householdId, householdId),
              isNull(transactions.transferGroupId),
            ),
          );
      }
    }
  }
};
