import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { accounts, balances } from "@/lib/db/schema";
import type { Viewer } from "./accounts";
import { ACCOUNT_NAME_MAX } from "./limits";

/** One of the viewer's own accounts, as Accounts and sharing lists it, archived ones too. */
export type OwnAccount = {
  id: string;
  name: string;
  institution: string | null;
  kind: (typeof accounts.$inferSelect)["kind"];
  isJoint: boolean;
  includeInBudgets: boolean;
  archived: boolean;
  /** Comes in by live sync, rather than from bank files or by hand. */
  live: boolean;
  manual: boolean;
  /** The newest balance, or null before the first one. */
  balanceCents: number | null;
};

/**
 * The accounts the viewer brought in, oldest first, each with its newest balance. Only these can
 * be renamed, archived or left out of budgets: a joint account belongs to whoever brought it in,
 * and someone else's accounts are theirs to change.
 */
export async function ownAccounts(db: Db, viewer: Viewer): Promise<OwnAccount[]> {
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      institution: accounts.institution,
      kind: accounts.kind,
      isJoint: accounts.isJoint,
      includeInBudgets: accounts.includeInBudgets,
      archived: accounts.archived,
      live: sql<boolean>`${accounts.connectionId} is not null`,
      manual: accounts.manual,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.householdId, viewer.householdId),
        eq(accounts.ownerMemberId, viewer.memberId),
      ),
    )
    .orderBy(asc(accounts.createdAt), asc(accounts.id));
  if (rows.length === 0) return [];
  const latest = await db
    .selectDistinctOn([balances.accountId], {
      accountId: balances.accountId,
      balanceCents: balances.balanceCents,
    })
    .from(balances)
    .innerJoin(accounts, eq(accounts.id, balances.accountId))
    .where(
      and(
        eq(accounts.householdId, viewer.householdId),
        eq(accounts.ownerMemberId, viewer.memberId),
      ),
    )
    .orderBy(balances.accountId, desc(balances.date));
  const balance = new Map(latest.map((row) => [row.accountId, row.balanceCents]));
  return rows.map((row) => ({ ...row, balanceCents: balance.get(row.id) ?? null }));
}

/** A change to one of your accounts. Anything left out stays as it is. */
export type AccountChange = {
  name?: unknown;
  includeInBudgets?: unknown;
  archived?: unknown;
};

export type AccountChanged = { ok: true; name: string } | { ok: false; error: string };

const NOT_YOURS = "Only the person who brought this account in can change it.";

/** "Westpac  Everyday " becomes "Westpac Everyday", or a reason it can't be the name. */
export function tidyAccountName(name: unknown): string | { ok: false; error: string } {
  const tidy = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  if (!tidy) return { ok: false, error: "Give the account a name." };
  if (tidy.length > ACCOUNT_NAME_MAX)
    return { ok: false, error: `Keep the name to ${ACCOUNT_NAME_MAX} characters or fewer.` };
  return tidy;
}

/**
 * Renames one of the viewer's own accounts, sets whether it counts toward budgets, or archives it
 * or brings it back. An archived account drops out of the account lists (Home's, Activity's
 * filters and the import picker) and live sync stops bringing anything new into it, but its
 * transactions stay. Live sync never renames an account, so a new name sticks.
 */
export async function changeAccount(
  db: Db,
  viewer: Viewer,
  id: string,
  change: AccountChange,
): Promise<AccountChanged> {
  const [account] = await db
    .select({ name: accounts.name })
    .from(accounts)
    .where(
      and(
        eq(accounts.id, id),
        eq(accounts.householdId, viewer.householdId),
        eq(accounts.ownerMemberId, viewer.memberId),
      ),
    );
  if (!account) return { ok: false, error: NOT_YOURS };

  const set: Partial<Pick<typeof accounts.$inferInsert, "name" | "includeInBudgets" | "archived">> =
    {};
  if (change.name !== undefined) {
    const tidy = tidyAccountName(change.name);
    if (typeof tidy !== "string") return tidy;
    set.name = tidy;
  }
  if (typeof change.includeInBudgets === "boolean") set.includeInBudgets = change.includeInBudgets;
  if (typeof change.archived === "boolean") set.archived = change.archived;
  if (Object.keys(set).length === 0) return { ok: true, name: account.name };

  await db
    .update(accounts)
    .set(set)
    .where(
      and(
        eq(accounts.id, id),
        eq(accounts.householdId, viewer.householdId),
        eq(accounts.ownerMemberId, viewer.memberId),
      ),
    );
  return { ok: true, name: set.name ?? account.name };
}
