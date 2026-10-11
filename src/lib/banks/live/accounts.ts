import { eq, sql } from "drizzle-orm";
import type { Viewer } from "@/lib/access";
import type { Db } from "@/lib/db";
import { accounts, balances, connections } from "@/lib/db/schema";
import { SourceError, type SourceAccount, type SourceAccountList } from "../source";
import { openConnection, recordProblem, type LiveOptions } from "./open";
import {
  startingVisibility,
  VISIBILITIES,
  type AccountKind,
  type AccountPick,
  type LiveAccount,
  type LiveAccountList,
  type SavePicksResult,
} from "./shapes";

/**
 * Picking the accounts behind a live sync connection: which ones come in, whether each is joint,
 * and who can see it. Only the member who connected it can pick (02 · Architecture, Who can see
 * what).
 */

const NOT_YOURS = "This live sync connection isn't yours, or it's been removed.";
const NONE_TICKED = "Tick at least one account.";
const SAVE_FAILED = "That didn't save. Try again.";

/**
 * A first guess at the kind of account from its name, since SimpleFIN doesn't say. A negative
 * balance with no other clue is most likely a credit card.
 */
export function guessKind(name: string, balanceCents: number): AccountKind {
  if (/\boffset\b/i.test(name)) return "everyday";
  if (/\b(home ?loan|mortgage)\b/i.test(name)) return "mortgage";
  if (/\bdebit\b/i.test(name)) return "everyday";
  if (/\b(credit|card|visa|mastercard|amex)\b/i.test(name)) return "credit";
  if (/\b(loan|lending)\b/i.test(name)) return "loan";
  if (/\b(saver|savings?|bonus|goal|term deposit|deposit)\b/i.test(name)) return "savings";
  if (/\b(everyday|transaction|cheque|access|spending|joint)\b/i.test(name)) return "everyday";
  return balanceCents < 0 ? "credit" : "everyday";
}

/** SimpleFIN doesn't say whether an account is joint, so the name is the only clue. */
export function guessJoint(name: string): boolean {
  return /\bjoint\b/i.test(name);
}

async function savedAccounts(db: Db, connectionId: string) {
  return db
    .select({
      id: accounts.id,
      externalId: accounts.externalId,
      kind: accounts.kind,
      isJoint: accounts.isJoint,
      visibility: accounts.visibility,
      archived: accounts.archived,
    })
    .from(accounts)
    .where(eq(accounts.connectionId, connectionId));
}

function asLive(account: SourceAccount, saved?: Awaited<ReturnType<typeof savedAccounts>>[number]) {
  if (saved)
    return {
      externalId: account.externalId,
      name: account.name,
      institution: account.institution,
      balanceCents: account.balanceCents,
      kind: saved.kind,
      isJoint: saved.isJoint,
      visibility: saved.visibility,
      included: !saved.archived,
      saved: true,
    } satisfies LiveAccount;
  const isJoint = guessJoint(account.name);
  return {
    externalId: account.externalId,
    name: account.name,
    institution: account.institution,
    balanceCents: account.balanceCents,
    kind: guessKind(account.name, account.balanceCents),
    isJoint,
    visibility: startingVisibility(isJoint),
    included: true,
    saved: false,
  } satisfies LiveAccount;
}

type Read =
  { ok: true; list: SourceAccountList } | { ok: false; reconnect: boolean; error: string };

/** The provider's list of accounts for one of the viewer's connections. Reads balances only. */
async function readList(
  db: Db,
  viewer: Viewer,
  connectionId: string,
  options: LiveOptions,
): Promise<Read> {
  try {
    const open = await openConnection(db, viewer, connectionId, options);
    if (!open) return { ok: false, reconnect: false, error: NOT_YOURS };
    return { ok: true, list: await open.source.listAccounts() };
  } catch (error) {
    if (!(error instanceof SourceError)) throw error;
    if (error.kind === "auth") await recordProblem(db, connectionId, error);
    return { ok: false, reconnect: error.kind === "auth", error: error.message };
  }
}

/**
 * Every account behind one of the viewer's connections, in the order the provider lists them, with
 * the choices saved for it before or first guesses. Reads balances only, so it's quick.
 */
export async function listLiveAccounts(
  db: Db,
  viewer: Viewer,
  connectionId: string,
  options: LiveOptions = {},
): Promise<LiveAccountList> {
  const read = await readList(db, viewer, connectionId, options);
  if (!read.ok) return read;
  const { list } = read;
  const saved = new Map((await savedAccounts(db, connectionId)).map((a) => [a.externalId, a]));
  await db
    .update(connections)
    .set({ bankCount: list.bankCount })
    .where(eq(connections.id, connectionId));
  return {
    ok: true,
    accounts: list.accounts.map((account) => asLive(account, saved.get(account.externalId))),
    bankCount: list.bankCount,
  };
}

/**
 * Saves the person's picks for a connection's accounts: ticked ones are made (or brought back)
 * with the viewer as owner, their joint flag and visibility, and today's balance. Unticked ones
 * are kept archived and private, so the screen remembers them as left out and nothing from them
 * comes in; one that came in before keeps what it brought. Names and balances come from the
 * provider, never from the screen. At least one account must be ticked.
 */
export async function saveAccountPicks(
  db: Db,
  viewer: Viewer,
  connectionId: string,
  picks: readonly AccountPick[],
  options: LiveOptions = {},
): Promise<SavePicksResult> {
  const chosen = new Map(
    picks
      .filter((pick) => VISIBILITIES.includes(pick.visibility))
      .map((pick) => [pick.externalId, pick]),
  );
  const read = await readList(db, viewer, connectionId, options);
  if (!read.ok) return { ok: false, error: read.error };
  const { list } = read;
  const ticked = list.accounts.filter((account) => chosen.get(account.externalId)?.include);
  if (ticked.length === 0) return { ok: false, error: NONE_TICKED };

  try {
    // Accounts keep the provider's order: each new one is made a moment after the one before.
    const madeAt = Date.now();
    await db.transaction(async (tx) => {
      for (const [i, account] of list.accounts.entries()) {
        const pick = chosen.get(account.externalId);
        const include = pick?.include === true;
        const isJoint = pick?.isJoint ?? guessJoint(account.name);
        const [row] = await tx
          .insert(accounts)
          .values({
            householdId: viewer.householdId,
            ownerMemberId: viewer.memberId,
            connectionId,
            externalId: account.externalId,
            institution: account.institution,
            name: account.name,
            kind: guessKind(account.name, account.balanceCents),
            isJoint,
            visibility: include ? pick.visibility : "private",
            archived: !include,
            createdAt: new Date(madeAt + i),
          })
          .onConflictDoUpdate({
            target: [accounts.connectionId, accounts.externalId],
            targetWhere: sql`${accounts.connectionId} is not null and ${accounts.externalId} is not null`,
            set: include
              ? { isJoint, visibility: pick.visibility, archived: false }
              : { archived: true },
          })
          .returning({ id: accounts.id });
        if (!include) continue;
        await tx
          .insert(balances)
          .values({ accountId: row.id, date: account.date, balanceCents: account.balanceCents })
          .onConflictDoUpdate({
            target: [balances.accountId, balances.date],
            set: { balanceCents: account.balanceCents },
          });
      }
      await tx
        .update(connections)
        .set({ bankCount: list.bankCount })
        .where(eq(connections.id, connectionId));
    });
  } catch (error) {
    // Only the error's code: a database message could quote the account names.
    console.error("Saving picked accounts failed", (error as { code?: string }).code);
    return { ok: false, error: SAVE_FAILED };
  }
  return { ok: true, picked: ticked.length };
}
