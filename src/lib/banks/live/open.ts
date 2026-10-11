import { and, eq } from "drizzle-orm";
import type { Viewer } from "@/lib/access";
import { decryptSecret, encryptionKey } from "@/lib/crypto";
import type { Db } from "@/lib/db";
import { connections, households } from "@/lib/db/schema";
import { SourceError, type BankSource } from "../source";
import { simplefinSource, type HttpOptions } from "../simplefin";

/** How the live sync code reaches the bank data. Tests pass their own `source`. */
export type LiveOptions = HttpOptions & {
  env?: Record<string, string | undefined>;
  /** Use this instead of the connection's own source. */
  source?: BankSource;
  now?: () => Date;
};

export type OpenConnection = {
  id: string;
  status: "ok" | "needs_reconnect" | "error";
  timeZone: string;
  source: BankSource;
};

const CANT_OPEN = "The saved access link can't be opened. Reconnect live sync.";

/**
 * One of the viewer's own live sync connections, opened: its access link is decrypted and wrapped
 * as a BankSource. Null when it isn't theirs. Throws SourceError `auth` when the link can't be
 * decrypted, for example after ENCRYPTION_KEY changed.
 */
export async function openConnection(
  db: Db,
  viewer: Viewer,
  connectionId: string,
  options: LiveOptions = {},
): Promise<OpenConnection | null> {
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) return null;
  const [row] = await db
    .select({
      id: connections.id,
      kind: connections.kind,
      status: connections.status,
      secret: connections.secretEncrypted,
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
  if (!row || row.kind !== "simplefin") return null;
  let source = options.source;
  if (!source) {
    let accessUrl: string;
    try {
      accessUrl = decryptSecret(row.secret, encryptionKey(options.env));
    } catch {
      throw new SourceError("auth", CANT_OPEN);
    }
    source = simplefinSource(accessUrl, row.timeZone, options);
  }
  return { id: row.id, status: row.status, timeZone: row.timeZone, source };
}

/** Saves why live sync stopped, in plain words: `auth` means reconnect, anything else is an error. */
export async function recordProblem(db: Db, connectionId: string, error: unknown): Promise<void> {
  const known = error instanceof SourceError;
  await db
    .update(connections)
    .set({
      status: known && error.kind === "auth" ? "needs_reconnect" : "error",
      lastError: known ? error.message : "Live sync stopped part way. Try again in a minute.",
    })
    .where(eq(connections.id, connectionId));
}
