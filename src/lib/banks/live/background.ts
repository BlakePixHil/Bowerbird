import { count, eq, max, sql } from "drizzle-orm";
import { after } from "next/server";
import type { Viewer } from "@/lib/access";
import type { Db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { claimSyncLease, runFirstSync, unfinishedFirstSyncs } from "./first-sync";

/**
 * Running the first sync in the background, after the response has gone: the person can leave the
 * screen and it keeps going until its time budget is used. Signed-in pages, and the actions on
 * them, may run for 60 seconds (`maxDuration` in `src/app/(app)/layout.tsx`).
 */

/** How long one background run keeps starting new windows: half the 60 seconds, leaving room for
 * the last window's request (at most 25 seconds) and the database. */
const BUDGET_MS = 30_000;

// On your own computer a pretend SimpleFIN server can run on localhost; never on Vercel.
const allowLocal = () => process.env.NODE_ENV === "development";

/** Runs the first sync with a lease already taken, once the response has gone. */
export function syncAfterResponse(db: Db, viewer: Viewer, connectionId: string, lease: Date) {
  after(async () => {
    await runFirstSync(db, viewer, connectionId, {
      lease,
      budgetMs: BUDGET_MS,
      allowLocal: allowLocal(),
    });
  });
}

/** Takes the lease and starts a run after the response. False when one is already running. */
export async function startFirstSync(db: Db, viewer: Viewer, connectionId: string) {
  const lease = await claimSyncLease(db, viewer, connectionId);
  if (lease) syncAfterResponse(db, viewer, connectionId, lease);
  return lease !== null;
}

/**
 * Carries on any of the viewer's first syncs that stopped part way, such as when the person closed
 * the app mid-sync. Called as a signed-in page loads; never holds the page up.
 */
export async function resumeFirstSyncs(db: Db, viewer: Viewer): Promise<boolean> {
  let started = false;
  for (const id of await unfinishedFirstSyncs(db, viewer)) {
    if (await startFirstSync(db, viewer, id)) started = true;
  }
  return started;
}

/** The household's live sync at a glance, for the header's sync slot. */
export async function liveSyncSummary(db: Db, viewer: Viewer, now = new Date()) {
  const [row] = await db
    .select({
      connections: count(),
      lastSyncedAt: max(connections.lastSyncedAt),
      running:
        sql<number>`count(*) filter (where ${connections.syncLeaseUntil} > ${now.toISOString()})`.mapWith(
          Number,
        ),
    })
    .from(connections)
    .where(eq(connections.householdId, viewer.householdId));
  return {
    connections: row?.connections ?? 0,
    lastSyncedAt: row?.lastSyncedAt ?? null,
    running: (row?.running ?? 0) > 0,
  };
}
