import {
  and,
  asc,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { Viewer } from "@/lib/access";
import type { Db } from "@/lib/db";
import { accounts, connections, members, transactions } from "@/lib/db/schema";
import { addDays, daysBetween, todayIn, type PlainDate } from "@/lib/money";
import { sortTransactions, type SortingRow } from "@/lib/sorting";
import { fillBalances, saveGivenBalance } from "../balances";
import type { SourceTransaction } from "../source";
import { saveBankStates } from "./banks";
import {
  claimLeaseForSync,
  firstSyncPending,
  firstSyncWindows,
  releaseLease,
  startRun,
  stopped,
  type RunState,
} from "./first-sync";
import { openConnectionForSync, type LiveOptions, type OpenConnection } from "./open";

/**
 * Keeping live sync connections up to date once their first sync is done. Each sync reads the
 * last 30 days for every picked account in one request, so pending rows that post are caught, and
 * saves what changed. Running it twice in a row changes nothing.
 */

/** Days each sync reads again. */
export const RECENT_DAYS = 30;
/** Opening the app starts a sync when the last one started longer ago than this. */
export const OPEN_SYNC_AFTER_MS = 60 * 60_000;
/** How long one run keeps starting new work, inside the 60 seconds a request may take. */
export const SYNC_BUDGET_MS = 35_000;
/** A pending row and the posted row that replaces it under a new id are at most this far apart. */
const POSTS_WITHIN_DAYS = 7;

const clock = (options: LiveOptions) => options.now?.() ?? new Date();

export type SyncResult =
  /** Brought up to date, or its first sync moved on. */
  | "synced"
  /** Another sync holds the connection. */
  | "busy"
  /** It stopped, and the connection now says why. */
  | "problem"
  /** There was nothing to sync: no such connection, or no accounts picked. */
  | "skipped";

/**
 * Syncs one connection. Carries on its first sync if that isn't finished, otherwise reads the last
 * 30 days. Takes the connection's lease, so it never runs twice at once. Doesn't check who's
 * asking: only for the daily job, and for code that has checked the connection is the household's.
 */
export async function syncConnection(
  db: Db,
  connectionId: string,
  options: LiveOptions & { budgetMs?: number } = {},
): Promise<SyncResult> {
  const startedAt = clock(options);
  const run: RunState = { lease: await claimLeaseForSync(db, connectionId, startedAt), windows: 0 };
  if (!run.lease) return "busy";
  try {
    const open = await openConnectionForSync(db, connectionId, options);
    if (!open) return "skipped";
    await startRun(db, connectionId, startedAt, open.status);
    if (await firstSyncPending(db, connectionId)) {
      const budget = options.budgetMs ?? SYNC_BUDGET_MS;
      await firstSyncWindows(db, open, run, startedAt, budget, options);
      return "synced";
    }
    return (await syncRecent(db, open, startedAt)) ? "synced" : "skipped";
  } catch (error) {
    await stopped(db, connectionId, error);
    return "problem";
  } finally {
    if (run.lease) await releaseLease(db, connectionId, run.lease);
  }
}

/** Reads the last 30 days for every picked account and saves what changed. False if none picked. */
async function syncRecent(db: Db, open: OpenConnection, now: Date): Promise<boolean> {
  const today = todayIn(open.timeZone, now);
  const from = addDays(today, -(RECENT_DAYS - 1));
  const picked = await db
    .select({ id: accounts.id, householdId: accounts.householdId, externalId: accounts.externalId })
    .from(accounts)
    .where(
      and(
        eq(accounts.connectionId, open.id),
        eq(accounts.archived, false),
        isNotNull(accounts.externalId),
      ),
    )
    .orderBy(asc(accounts.createdAt), asc(accounts.id));
  if (picked.length === 0) return false;

  const recent = await open.source.fetchRecent(
    picked.map((account) => account.externalId!),
    from,
  );
  const sent = new Map(recent.accounts.map((account) => [account.externalId, account]));
  await db.transaction(async (tx) => {
    for (const account of picked) {
      // An account the bank didn't send this time keeps its rows, and its balance carries on.
      const found = sent.get(account.externalId!);
      if (found) {
        const { id, householdId } = account;
        const rows = await saveRecent(tx, id, householdId, found.transactions, from);
        await sortTransactions(tx, householdId, rows);
        await saveGivenBalance(tx, id, found);
      }
      await fillBalances(tx, account.id, now);
    }
    await saveBankStates(tx, open.id, recent.accounts, recent.problems, now, open.timeZone);
    await tx
      .update(connections)
      .set({ lastSyncedAt: now, status: "ok", lastError: null })
      .where(eq(connections.id, open.id));
  });
  return true;
}

type Saved = {
  id: string;
  externalId: string | null;
  date: PlainDate;
  amountCents: number;
  description: string;
  pending: boolean;
  categoryId: string | null;
  merchantId: string | null;
};

const changed = (row: Saved, sent: SourceTransaction) =>
  row.date !== sent.date ||
  row.amountCents !== sent.amountCents ||
  row.description !== sent.description ||
  row.pending !== sent.pending;

/**
 * Saves an account's rows from the last 30 days, and returns the ones to sort. A row the account
 * already has (by the bank's id) is updated if anything changed, such as a pending row that
 * posted. A pending row the bank no longer sends is gone: if a posted row came in with the same
 * amount within a week, that's it posting under a new id, so the pending row becomes it (keeping
 * anything the person added); otherwise it's removed.
 */
async function saveRecent(
  db: Db,
  accountId: string,
  householdId: string,
  sent: SourceTransaction[],
  from: PlainDate,
): Promise<SortingRow[]> {
  const ids = sent.map((row) => row.externalId);
  const saved: Saved[] = await db
    .select({
      id: transactions.id,
      externalId: transactions.externalId,
      date: transactions.date,
      amountCents: transactions.amountCents,
      description: transactions.descriptionRaw,
      pending: transactions.pending,
      categoryId: transactions.categoryId,
      merchantId: transactions.merchantId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        or(
          ids.length > 0 ? inArray(transactions.externalId, ids) : undefined,
          and(
            eq(transactions.pending, true),
            eq(transactions.source, "sync"),
            gte(transactions.date, from),
          ),
        ),
      ),
    );

  const byId = new Map(saved.flatMap((row) => (row.externalId ? [[row.externalId, row]] : [])));
  const updates: { row: Saved; to: SourceTransaction }[] = [];
  const fresh: SourceTransaction[] = [];
  for (const row of sent) {
    const have = byId.get(row.externalId);
    if (!have) fresh.push(row);
    else if (changed(have, row)) updates.push({ row: have, to: row });
  }

  const sentIds = new Set(ids);
  const gone = saved
    .filter((row) => row.pending && !(row.externalId && sentIds.has(row.externalId)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const removed: string[] = [];
  for (const row of gone) {
    const posted = closest(row, fresh);
    if (!posted) {
      removed.push(row.id);
      continue;
    }
    fresh.splice(fresh.indexOf(posted), 1);
    updates.push({ row, to: posted });
  }

  if (removed.length > 0) await db.delete(transactions).where(inArray(transactions.id, removed));
  const toSort: SortingRow[] = [];
  for (const { row, to } of updates) {
    await db
      .update(transactions)
      .set({
        externalId: to.externalId,
        date: to.date,
        amountCents: to.amountCents,
        descriptionRaw: to.description,
        pending: to.pending,
      })
      .where(eq(transactions.id, row.id));
    // Only rows nothing has sorted yet: a category or shop the person chose stays.
    if (!row.categoryId && !row.merchantId)
      toSort.push({
        id: row.id,
        accountId,
        date: to.date,
        amountCents: to.amountCents,
        description: to.description,
      });
  }
  if (fresh.length > 0) {
    const inserted = await db
      .insert(transactions)
      .values(
        fresh.map((row) => ({
          householdId,
          accountId,
          externalId: row.externalId,
          date: row.date,
          amountCents: row.amountCents,
          descriptionRaw: row.description,
          pending: row.pending,
          source: "sync" as const,
        })),
      )
      .onConflictDoNothing()
      .returning({
        id: transactions.id,
        date: transactions.date,
        amountCents: transactions.amountCents,
        description: transactions.descriptionRaw,
      });
    toSort.push(...inserted.map((row) => ({ ...row, accountId })));
  }
  return toSort;
}

/** The posted row nearest in date to a pending one, with the same amount, within a week. */
function closest(pending: Saved, fresh: SourceTransaction[]): SourceTransaction | null {
  let best: SourceTransaction | null = null;
  let bestGap = Infinity;
  for (const row of fresh) {
    if (row.pending || row.amountCents !== pending.amountCents) continue;
    const gap = Math.abs(daysBetween(pending.date, row.date));
    if (gap <= POSTS_WITHIN_DAYS && gap < bestGap) [best, bestGap] = [row, gap];
  }
  return best;
}

export type SyncCounts = {
  synced: number;
  problems: number;
  busy: number;
  /** Connections left for next time because the time ran out. */
  left: number;
};

/** Syncs connections one by one, stalest first, until they're all done or the budget is used. */
async function syncEach(
  db: Db,
  ids: string[],
  options: LiveOptions & { budgetMs?: number },
): Promise<SyncCounts> {
  const startedAt = clock(options).getTime();
  const budget = options.budgetMs ?? SYNC_BUDGET_MS;
  const counts: SyncCounts = { synced: 0, problems: 0, busy: 0, left: 0 };
  for (const id of ids) {
    const used = clock(options).getTime() - startedAt;
    if (used >= budget) {
      counts.left++;
      continue;
    }
    const result = await syncConnection(db, id, { ...options, budgetMs: budget - used });
    if (result === "synced") counts.synced++;
    else if (result === "problem") counts.problems++;
    else if (result === "busy") counts.busy++;
  }
  return counts;
}

/** Live sync connections with at least one account picked. */
const hasPicked = (db: Db) =>
  exists(
    db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.connectionId, connections.id), eq(accounts.archived, false))),
  );

/** The viewer's household, as long as they're a member of it. */
const inHousehold = (db: Db, viewer: Viewer) =>
  and(
    eq(connections.householdId, viewer.householdId),
    exists(
      db
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.id, viewer.memberId), eq(members.householdId, viewer.householdId))),
    ),
  );

const stalestFirst = [sql`${connections.lastSyncedAt} asc nulls first`, asc(connections.id)];

/** The daily job: every household's connections, stalest first, inside the time budget. */
export async function syncEverything(db: Db, options: LiveOptions & { budgetMs?: number } = {}) {
  const rows = await db
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.kind, "simplefin"), hasPicked(db)))
    .orderBy(...stalestFirst);
  return syncEach(
    db,
    rows.map((row) => row.id),
    options,
  );
}

/** Sync now: every connection in the viewer's household, whoever connected it. */
export async function syncHousehold(
  db: Db,
  viewer: Viewer,
  options: LiveOptions & { budgetMs?: number } = {},
) {
  const rows = await db
    .select({ id: connections.id })
    .from(connections)
    .where(and(inHousehold(db, viewer), eq(connections.kind, "simplefin"), hasPicked(db)))
    .orderBy(...stalestFirst);
  return syncEach(
    db,
    rows.map((row) => row.id),
    options,
  );
}

/**
 * The household's connections that opening the app should sync: first sync done, no reconnect
 * waiting, no sync running, and none started in the last hour, worked or not.
 */
function dueWhere(db: Db, viewer: Viewer, now: Date) {
  const hourAgo = new Date(now.getTime() - OPEN_SYNC_AFTER_MS);
  return and(
    inHousehold(db, viewer),
    eq(connections.kind, "simplefin"),
    ne(connections.status, "needs_reconnect"),
    isNotNull(connections.lastSyncedAt),
    or(isNull(connections.syncLeaseUntil), lt(connections.syncLeaseUntil, now)),
    sql`greatest(${connections.lastSyncedAt}, ${connections.syncTriedAt}) < ${hourAgo.toISOString()}`,
    hasPicked(db),
  );
}

/** Whether opening the app now should start a sync. */
export async function syncIsDue(db: Db, viewer: Viewer, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(dueWhere(db, viewer, now))
    .limit(1);
  return row !== undefined;
}

/** Sync on open: the household's connections that are due. */
export async function syncDue(
  db: Db,
  viewer: Viewer,
  options: LiveOptions & { budgetMs?: number } = {},
) {
  const rows = await db
    .select({ id: connections.id })
    .from(connections)
    .where(dueWhere(db, viewer, clock(options)))
    .orderBy(...stalestFirst);
  return syncEach(
    db,
    rows.map((row) => row.id),
    options,
  );
}
