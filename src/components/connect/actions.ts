"use server";

import { viewerOf } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { connectSimpleFin, reconnectSimpleFin } from "@/lib/banks/connections";
import {
  firstSyncProgress,
  saveAccountPicks,
  VISIBILITIES,
  type AccountPick,
  type FirstSyncProgress,
} from "@/lib/banks/live";
import { startFirstSync } from "@/lib/banks/live/background";
import { getDb } from "@/lib/db";

// On your own computer a pretend SimpleFIN server can run on localhost; never on Vercel.
const dev = () => process.env.NODE_ENV === "development";

export type ConnectAnswer = { ok: true; next: string } | { ok: false; error: string };

/**
 * Claims the pasted setup token for the signed-in member and saves the connection, or with
 * `reconnect`, gives one of their connections the new access link. The token is only ever in this
 * request: it isn't logged, saved or sent back.
 */
export async function connectLiveSync(form: FormData): Promise<ConnectAnswer> {
  const me = await requireMember();
  const token = form.get("token");
  const reconnect = form.get("reconnect");
  if (typeof token !== "string" || token.length > 4096)
    return { ok: false, error: "Paste the setup token from Redbark." };
  const options = { allowLocal: dev() };
  if (typeof reconnect === "string" && reconnect !== "") {
    const result = await reconnectSimpleFin(getDb(), viewerOf(me), reconnect, token, options);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, next: "/accounts" };
  }
  const result = await connectSimpleFin(getDb(), viewerOf(me), token, options);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, next: `/connect/accounts?connection=${result.connectionId}` };
}

export type PickAnswer = { ok: true; next: string } | { ok: false; error: string };

const isPick = (value: unknown): value is AccountPick => {
  const pick = value as AccountPick;
  return (
    typeof pick === "object" &&
    pick !== null &&
    typeof pick.externalId === "string" &&
    pick.externalId.length <= 255 &&
    typeof pick.include === "boolean" &&
    typeof pick.isJoint === "boolean" &&
    VISIBILITIES.includes(pick.visibility)
  );
};

/**
 * Saves which of a connection's accounts come in and who sees each, then starts the first sync in
 * the background so it's under way before the next screen opens.
 */
export async function bringInAccounts(connectionId: string, picks: unknown): Promise<PickAnswer> {
  const viewer = viewerOf(await requireMember());
  if (typeof connectionId !== "string" || !Array.isArray(picks) || !picks.every(isPick))
    return { ok: false, error: "That didn't save. Try again." };
  const db = getDb();
  const saved = await saveAccountPicks(db, viewer, connectionId, picks, { allowLocal: dev() });
  if (!saved.ok) return saved;
  await startFirstSync(db, viewer, connectionId);
  return { ok: true, next: `/connect/sync?connection=${connectionId}` };
}

/**
 * Where the first sync is up to, for the sync screen to show. If nothing is running and there's
 * more to do, it starts the next run in the background. After a problem it waits for Try again.
 */
export async function keepSyncing(
  connectionId: string,
  retry = false,
): Promise<FirstSyncProgress | null> {
  const viewer = viewerOf(await requireMember());
  if (typeof connectionId !== "string") return null;
  const db = getDb();
  const progress = await firstSyncProgress(db, viewer, connectionId);
  if (!progress || progress.finished || progress.running || progress.accounts.length === 0)
    return progress;
  if (progress.problem && retry !== true) return progress;
  const started = await startFirstSync(db, viewer, connectionId);
  return started ? { ...progress, running: true, problem: null } : progress;
}
