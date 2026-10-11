import { and, asc, count, desc, eq, inArray, isNull, lt, min, or, sql } from "drizzle-orm";
import type { Viewer } from "@/lib/access";
import type { Db } from "@/lib/db";
import { accounts, connections, households, transactions } from "@/lib/db/schema";
import { addDays, todayIn, type PlainDate } from "@/lib/money";
import { sortTransactions, type SortingRow } from "@/lib/sorting";
import { fillBalances, saveGivenBalance } from "../balances";
import type { BankSource } from "../source";
import { openConnection, recordProblem, type LiveOptions, type OpenConnection } from "./open";
import { MAX_HISTORY_DAYS, WINDOW_DAYS, type FirstSyncProgress, type SyncAccount } from "./shapes";

/**
 * The first sync after accounts are picked: it brings in each account's history, newest first, a
 * window at a time and one account per request, so every request stays well inside the function
 * time limit. Progress lives in the database (`accounts.history_from` and `history_synced_at`),
 * so a sync that's stopped part way carries on from where it got to. A lease on the connection
 * (`connections.sync_lease_until`) means only one sync works on a connection at a time.
 */

/** How long a lease lasts. Each window renews it, and one window takes well under this. */
const LEASE_MS = 45_000;
/** Rows per insert, well inside Postgres's limit on query parameters. */
const CHUNK = 500;

const STOPPED = "Live sync stopped part way. Try again in a minute.";

const clock = (options: LiveOptions) => options.now?.() ?? new Date();

/**
 * Where the first sync of one of the viewer's connections is up to. Reads only the database, so
 * it's cheap to ask while the sync screen is open. Null if the connection isn't theirs.
 */
export async function firstSyncProgress(
  db: Db,
  viewer: Viewer,
  connectionId: string,
  now = new Date(),
): Promise<FirstSyncProgress | null> {
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) return null;
  const [connection] = await db
    .select({
      id: connections.id,
      status: connections.status,
      lastError: connections.lastError,
      lastSyncedAt: connections.lastSyncedAt,
      leaseUntil: connections.syncLeaseUntil,
      bankCount: connections.bankCount,
      timeZone: households.timezone,
    })
    .from(connections)
    .innerJoin(households, eq(households.id, connections.householdId))
    .where(
      and(
        eq(connections.id, connectionId),
        eq(connections.memberId, viewer.memberId),
        eq(connections.householdId, viewer.householdId),
      ),
    );
  if (!connection) return null;

  const picked = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      kind: accounts.kind,
      isJoint: accounts.isJoint,
      historyFrom: accounts.historyFrom,
      historySyncedAt: accounts.historySyncedAt,
    })
    .from(accounts)
    .where(and(eq(accounts.connectionId, connectionId), eq(accounts.archived, false)))
    .orderBy(asc(accounts.createdAt), asc(accounts.id));

  const counts = picked.length
    ? await db
        .select({
          accountId: transactions.accountId,
          rows: count(),
          oldest: min(transactions.date),
        })
        .from(transactions)
        .where(
          inArray(
            transactions.accountId,
            picked.map((account) => account.id),
          ),
        )
        .groupBy(transactions.accountId)
    : [];
  const byAccount = new Map(counts.map((row) => [row.accountId, row]));

  const list = picked.map((account): SyncAccount => {
    const found = byAccount.get(account.id);
    return {
      id: account.id,
      name: account.name,
      kind: account.kind,
      isJoint: account.isJoint,
      status: account.historySyncedAt ? "done" : account.historyFrom ? "busy" : "waiting",
      rows: found?.rows ?? 0,
      oldest: found?.oldest ?? null,
      historyFrom: account.historyFrom,
    };
  });
  const lastHistory = Math.max(0, ...picked.map((a) => a.historySyncedAt?.getTime() ?? 0));
  const done = list.filter((account) => account.status === "done").length;
  return {
    connectionId,
    accounts: list,
    rows: list.reduce((sum, account) => sum + account.rows, 0),
    done,
    finished:
      list.length > 0 &&
      done === list.length &&
      (connection.lastSyncedAt?.getTime() ?? 0) >= lastHistory,
    running: (connection.leaseUntil?.getTime() ?? 0) > now.getTime(),
    problem:
      connection.status === "ok"
        ? null
        : {
            reconnect: connection.status === "needs_reconnect",
            message: connection.lastError ?? STOPPED,
          },
    bankCount: connection.bankCount,
    today: todayIn(connection.timeZone, now),
  };
}

/**
 * Takes the connection's sync lease if no one holds it, and returns it. Null when another sync
 * holds it, or the connection isn't the viewer's.
 */
export async function claimSyncLease(
  db: Db,
  viewer: Viewer,
  connectionId: string,
  now = new Date(),
): Promise<Date | null> {
  return claim(db, connectionId, now, viewer);
}

/** Takes any connection's lease, for the daily job. Null when another sync holds it. */
export async function claimLeaseForSync(db: Db, connectionId: string, now = new Date()) {
  return claim(db, connectionId, now, null);
}

async function claim(db: Db, connectionId: string, now: Date, viewer: Viewer | null) {
  const until = new Date(now.getTime() + LEASE_MS);
  const [row] = await db
    .update(connections)
    .set({ syncLeaseUntil: until })
    .where(
      and(
        eq(connections.id, connectionId),
        viewer ? eq(connections.memberId, viewer.memberId) : undefined,
        viewer ? eq(connections.householdId, viewer.householdId) : undefined,
        or(isNull(connections.syncLeaseUntil), lt(connections.syncLeaseUntil, now)),
      ),
    )
    .returning({ id: connections.id });
  return row ? until : null;
}

/** Extends a lease this sync holds. Null if it ran out and another sync took it. */
async function renewLease(db: Db, connectionId: string, lease: Date, now: Date) {
  const until = new Date(now.getTime() + LEASE_MS);
  const [row] = await db
    .update(connections)
    .set({ syncLeaseUntil: until })
    .where(and(eq(connections.id, connectionId), eq(connections.syncLeaseUntil, lease)))
    .returning({ id: connections.id });
  return row ? until : null;
}

/** Lets go of a lease this sync holds, so the next sync can start straight away. */
export async function releaseLease(db: Db, connectionId: string, lease: Date) {
  await db
    .update(connections)
    .set({ syncLeaseUntil: null })
    .where(and(eq(connections.id, connectionId), eq(connections.syncLeaseUntil, lease)));
}

type Pending = {
  id: string;
  householdId: string;
  externalId: string;
  historyFrom: PlainDate | null;
};

/** The next account with history still to fetch: one not started yet, else the most recent. */
async function nextAccount(db: Db, connectionId: string): Promise<Pending | null> {
  const [row] = await db
    .select({
      id: accounts.id,
      householdId: accounts.householdId,
      externalId: accounts.externalId,
      historyFrom: accounts.historyFrom,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.connectionId, connectionId),
        eq(accounts.archived, false),
        isNull(accounts.historySyncedAt),
      ),
    )
    .orderBy(
      sql`${accounts.historyFrom} desc nulls first`,
      asc(accounts.createdAt),
      asc(accounts.id),
    )
    .limit(1);
  if (!row?.externalId) return null;
  return { ...row, externalId: row.externalId };
}

/**
 * Brings in one window of an account's history, the days just before what it has so far. The
 * account is done when a window comes back empty, or the window reaches the furthest back the
 * first sync goes. If another sync already did this window, nothing changes.
 */
async function syncWindow(
  db: Db,
  source: BankSource,
  account: Pending,
  today: PlainDate,
  now: Date,
): Promise<void> {
  const earliest = addDays(today, -(MAX_HISTORY_DAYS - 1));
  const to = account.historyFrom ? addDays(account.historyFrom, -1) : today;
  const back = addDays(to, -(WINDOW_DAYS - 1));
  const start = back < earliest ? earliest : back;
  // Days have passed since it last ran and it's already back as far as it goes: nothing to fetch.
  const past = to < earliest;
  const rows = past ? [] : await source.fetchTransactions(account.externalId, start, to);
  const finished = past || rows.length === 0 || start === earliest;

  await db.transaction(async (tx) => {
    // Only move on from where this sync found the account, so two syncs can't both do a window.
    const [moved] = await tx
      .update(accounts)
      .set({
        historyFrom: past ? account.historyFrom : start,
        historySyncedAt: finished ? now : null,
      })
      .where(
        and(
          eq(accounts.id, account.id),
          isNull(accounts.historySyncedAt),
          account.historyFrom
            ? eq(accounts.historyFrom, account.historyFrom)
            : isNull(accounts.historyFrom),
        ),
      )
      .returning({ id: accounts.id });
    if (!moved) return;

    const saved: SortingRow[] = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
      const inserted = await tx
        .insert(transactions)
        .values(
          rows.slice(i, i + CHUNK).map((row) => ({
            householdId: account.householdId,
            accountId: account.id,
            externalId: row.externalId,
            date: row.date,
            amountCents: row.amountCents,
            descriptionRaw: row.description,
            pending: row.pending,
            source: "sync" as const,
          })),
        )
        // A row the account already has, from an earlier window or sync, stays as it is.
        .onConflictDoNothing()
        .returning({
          id: transactions.id,
          date: transactions.date,
          amountCents: transactions.amountCents,
          description: transactions.descriptionRaw,
        });
      saved.push(...inserted.map((row) => ({ ...row, accountId: account.id })));
    }
    await sortTransactions(tx, account.householdId, saved);
  });
}

/** Once every account's history is in: saves the latest balances and marks the sync done. */
async function finish(db: Db, connectionId: string, source: BankSource, now: Date) {
  const list = await source.listAccounts();
  const picked = await db
    .select({ id: accounts.id, externalId: accounts.externalId })
    .from(accounts)
    .where(and(eq(accounts.connectionId, connectionId), eq(accounts.archived, false)));
  const ids = new Map(picked.map((account) => [account.externalId, account.id]));
  await db.transaction(async (tx) => {
    for (const account of list.accounts) {
      const accountId = ids.get(account.externalId);
      if (accountId) await saveGivenBalance(tx, accountId, account);
    }
    // Every day back to the oldest row, worked out from today's balance.
    for (const account of picked) await fillBalances(tx, account.id, now);
    await tx
      .update(connections)
      .set({ lastSyncedAt: now, status: "ok", lastError: null, bankCount: list.bankCount })
      .where(eq(connections.id, connectionId));
  });
}

/** Whether the finishing step still has to run: the history is in, but not marked synced since. */
async function needsFinish(db: Db, connectionId: string): Promise<boolean> {
  const [row] = await db
    .select({ lastSyncedAt: connections.lastSyncedAt })
    .from(connections)
    .where(eq(connections.id, connectionId));
  const [latest] = await db
    .select({ at: accounts.historySyncedAt })
    .from(accounts)
    .where(and(eq(accounts.connectionId, connectionId), eq(accounts.archived, false)))
    .orderBy(sql`${accounts.historySyncedAt} desc nulls last`)
    .limit(1);
  if (!latest?.at) return false;
  return !row?.lastSyncedAt || row.lastSyncedAt < latest.at;
}

/** Whether a connection's first sync still has work: an account's history, or the finish. */
export async function firstSyncPending(db: Db, connectionId: string): Promise<boolean> {
  const [unsynced] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.connectionId, connectionId),
        eq(accounts.archived, false),
        isNull(accounts.historySyncedAt),
      ),
    )
    .limit(1);
  return unsynced !== undefined || (await needsFinish(db, connectionId));
}

/** Marks the start of a sync: when it was tried, and no problem showing while it runs. */
export async function startRun(
  db: Db,
  connectionId: string,
  now: Date,
  status: OpenConnection["status"],
) {
  await db
    .update(connections)
    .set({
      syncTriedAt: now,
      ...(status === "ok" ? {} : { status: "ok" as const, lastError: null }),
    })
    .where(eq(connections.id, connectionId));
}

/** A sync's lease, kept current as it's renewed, and how many windows it's done. */
export type RunState = { lease: Date | null; windows: number };

/**
 * Brings in first-sync windows until every account is in (then saves balances and marks it synced)
 * or the time budget is used. At least one window runs. Throws what the source throws.
 */
export async function firstSyncWindows(
  db: Db,
  open: OpenConnection,
  run: RunState,
  startedAt: Date,
  budgetMs: number,
  options: LiveOptions,
): Promise<boolean> {
  for (;;) {
    const now = clock(options);
    if (run.windows > 0 && now.getTime() - startedAt.getTime() >= budgetMs) return false;
    run.lease = run.lease && (await renewLease(db, open.id, run.lease, now));
    if (!run.lease) return false;
    const account = await nextAccount(db, open.id);
    if (!account) {
      if (await needsFinish(db, open.id)) await finish(db, open.id, open.source, now);
      return true;
    }
    await syncWindow(db, open.source, account, todayIn(open.timeZone, now), now);
    run.windows++;
  }
}

export type FirstSyncRun =
  /** Another sync is working on this connection, or it isn't the viewer's. */
  | { ran: false }
  /** Stopped at the time budget, finished, or stopped by a problem it saved on the connection. */
  | { ran: true; windows: number; finished: boolean; problem: boolean };

/**
 * Works through the first sync of one of the viewer's connections until it's done or the time
 * budget is used, then lets go of the lease. Pass a lease from `claimSyncLease` to use it, or none
 * to take one. At least one window runs, however small the budget. A failure from the provider is
 * saved on the connection in plain words, and the next run picks up where this one stopped.
 */
export async function runFirstSync(
  db: Db,
  viewer: Viewer,
  connectionId: string,
  options: LiveOptions & { lease?: Date; budgetMs?: number } = {},
): Promise<FirstSyncRun> {
  const startedAt = clock(options);
  const lease = options.lease ?? (await claimSyncLease(db, viewer, connectionId, startedAt));
  if (!lease) return { ran: false };
  const run: RunState = { lease, windows: 0 };
  try {
    const open = await openConnection(db, viewer, connectionId, options);
    if (!open) return { ran: false };
    await startRun(db, connectionId, startedAt, open.status);
    const budget = options.budgetMs ?? 30_000;
    const finished = await firstSyncWindows(db, open, run, startedAt, budget, options);
    return { ran: true, windows: run.windows, finished, problem: false };
  } catch (error) {
    await stopped(db, connectionId, error);
    return { ran: true, windows: run.windows, finished: false, problem: true };
  } finally {
    if (run.lease) await releaseLease(db, connectionId, run.lease);
  }
}

/** Saves why a sync stopped. Logs only the error's name and code: messages could quote bank data. */
export async function stopped(db: Db, connectionId: string, error: unknown) {
  const { name, code } = error as { name?: string; code?: string };
  console.error("Live sync stopped", name, code ?? "");
  await recordProblem(db, connectionId, error);
}

/**
 * The viewer's connections with a first sync still to finish and nothing stopping it: none of
 * them is waiting on a reconnect or an error. For carrying on when the person comes back.
 */
export async function unfinishedFirstSyncs(db: Db, viewer: Viewer): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: connections.id })
    .from(connections)
    .innerJoin(accounts, eq(accounts.connectionId, connections.id))
    .where(
      and(
        eq(connections.memberId, viewer.memberId),
        eq(connections.householdId, viewer.householdId),
        eq(connections.status, "ok"),
        eq(accounts.archived, false),
        or(
          isNull(accounts.historySyncedAt),
          isNull(connections.lastSyncedAt),
          lt(connections.lastSyncedAt, accounts.historySyncedAt),
        ),
      ),
    )
    .orderBy(desc(connections.id));
  return rows.map((row) => row.id);
}
