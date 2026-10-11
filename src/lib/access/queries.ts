import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { balances, transactions } from "@/lib/db/schema";
import type { PlainDate } from "@/lib/money";
import { scopeFor, type View, type Viewer, type Whose } from "./accounts";

export type TransactionFilters = {
  /** First day to include. */
  from?: PlainDate;
  /** Last day to include. */
  to?: PlainDate;
  /** Only these accounts. Accounts the viewer can't see in full are still left out. */
  accountIds?: readonly string[];
  limit?: number;
};

export type SeenTransaction = typeof transactions.$inferSelect & { whose: Whose };

/**
 * Transactions in one view, newest first, each saying whose account it came from. Only accounts
 * the viewer can see in full are included, so balance-only and hidden accounts never show
 * transactions.
 */
export async function transactionsFor(
  db: Db,
  viewer: Viewer,
  view: View,
  filters: TransactionFilters = {},
): Promise<SeenTransaction[]> {
  const { accounts } = await scopeFor(db, viewer, view);
  const full = new Map(
    accounts.filter((account) => account.access === "full").map((a) => [a.id, a.whose]),
  );
  const ids = [...full.keys()].filter(
    (id) => !filters.accountIds || filters.accountIds.includes(id),
  );
  if (ids.length === 0) return [];

  const query = db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, viewer.householdId),
        inArray(transactions.accountId, ids),
        filters.from ? gte(transactions.date, filters.from) : undefined,
        filters.to ? lte(transactions.date, filters.to) : undefined,
      ),
    )
    .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
    .$dynamic();
  const rows = await (filters.limit ? query.limit(filters.limit) : query);
  return rows.map((row) => ({ ...row, whose: full.get(row.accountId)! }));
}

export type BalanceRange = { from?: PlainDate; to?: PlainDate };

export type SeenBalance = {
  accountId: string;
  date: PlainDate;
  balanceCents: number;
  whose: Whose;
};

/** Daily balances in one view, oldest first. Balance-only accounts are included. */
export async function balancesFor(
  db: Db,
  viewer: Viewer,
  view: View,
  range: BalanceRange = {},
): Promise<SeenBalance[]> {
  const { accounts } = await scopeFor(db, viewer, view);
  const seen = new Map(accounts.map((account) => [account.id, account.whose]));
  if (seen.size === 0) return [];

  const rows = await db
    .select({
      accountId: balances.accountId,
      date: balances.date,
      balanceCents: balances.balanceCents,
    })
    .from(balances)
    .where(
      and(
        inArray(balances.accountId, [...seen.keys()]),
        range.from ? gte(balances.date, range.from) : undefined,
        range.to ? lte(balances.date, range.to) : undefined,
      ),
    )
    .orderBy(asc(balances.date), asc(balances.accountId));
  return rows.map((row) => ({ ...row, whose: seen.get(row.accountId)! }));
}

/** Each account's newest balance in one view, by account. Accounts with none are left out. */
export async function latestBalances(
  db: Db,
  viewer: Viewer,
  view: View,
): Promise<Map<string, number>> {
  const { accounts } = await scopeFor(db, viewer, view);
  if (accounts.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([balances.accountId], {
      accountId: balances.accountId,
      balanceCents: balances.balanceCents,
    })
    .from(balances)
    .where(
      inArray(
        balances.accountId,
        accounts.map((account) => account.id),
      ),
    )
    .orderBy(balances.accountId, desc(balances.date));
  return new Map(rows.map((row) => [row.accountId, row.balanceCents]));
}
