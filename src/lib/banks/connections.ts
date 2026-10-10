import { and, eq } from "drizzle-orm";
import type { Viewer } from "@/lib/access";
import { canEncrypt, encryptionKey, encryptSecret } from "@/lib/crypto";
import type { Db } from "@/lib/db";
import { connections, members } from "@/lib/db/schema";
import { checkSetupToken, claimSetupToken, type ClaimProblem, type HttpOptions } from "./simplefin";

/**
 * Live sync connections. Each belongs to the member who connected it, and only that member can
 * use or change it. The access link is stored sealed (src/lib/crypto) and never leaves the server.
 */

export const NO_KEY =
  "Live sync isn't ready on this server yet: it needs its encryption key. Your setup token wasn't used, so it still works.";
const notSaved = (provider: string) =>
  `Your banks connected, but the app couldn't save the link. Make a new setup token in ${provider} and try again.`;
const NOT_A_MEMBER = "Sign in again, then paste the setup token once more.";

export type ConnectResult =
  | { ok: true; connectionId: string; provider: string }
  | { ok: false; problem: ClaimProblem | "not_ready" | "not_saved"; error: string };

/**
 * Claims a SimpleFIN setup token for the viewer and saves the connection. The token works once, so
 * everything that could stop the save is checked before it's used: the viewer, the server's
 * encryption key and the token itself.
 */
export async function connectSimpleFin(
  db: Db,
  viewer: Viewer,
  setupToken: string,
  options: HttpOptions & { env?: Record<string, string | undefined> } = {},
): Promise<ConnectResult> {
  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, viewer.memberId), eq(members.householdId, viewer.householdId)));
  if (!member) return { ok: false, problem: "not_saved", error: NOT_A_MEMBER };
  if (!canEncrypt(options.env)) return { ok: false, problem: "not_ready", error: NO_KEY };
  const check = checkSetupToken(setupToken);
  if (!check.ok) return { ok: false, problem: "not_a_token", error: check.error };

  const claim = await claimSetupToken(setupToken, options);
  if (!claim.ok) return claim;

  try {
    const [row] = await db
      .insert(connections)
      .values({
        householdId: viewer.householdId,
        memberId: viewer.memberId,
        kind: "simplefin",
        secretEncrypted: encryptSecret(claim.accessUrl, encryptionKey(options.env)),
        status: "ok",
      })
      .returning({ id: connections.id });
    return { ok: true, connectionId: row.id, provider: claim.provider };
  } catch (error) {
    // Only the error's code: the message could hold the values being saved.
    console.error("Saving a live sync connection failed", (error as { code?: string }).code);
    return { ok: false, problem: "not_saved", error: notSaved(claim.provider) };
  }
}

export type OwnConnection = {
  id: string;
  kind: "simplefin" | "coinspot";
  status: "ok" | "needs_reconnect" | "error";
  lastSyncedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
};

/** One of the viewer's own connections, without its secret, or null if it isn't theirs. */
export async function ownConnection(
  db: Db,
  viewer: Viewer,
  connectionId: string,
): Promise<OwnConnection | null> {
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) return null;
  const [row] = await db
    .select({
      id: connections.id,
      kind: connections.kind,
      status: connections.status,
      lastSyncedAt: connections.lastSyncedAt,
      lastError: connections.lastError,
      createdAt: connections.createdAt,
    })
    .from(connections)
    .where(
      and(
        eq(connections.id, connectionId),
        eq(connections.memberId, viewer.memberId),
        eq(connections.householdId, viewer.householdId),
      ),
    );
  return row ?? null;
}
