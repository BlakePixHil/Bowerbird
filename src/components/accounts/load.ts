import { and, count, eq } from "drizzle-orm";
import { accountIcon } from "@/components/import/labels";
import { ownAccounts, type Viewer } from "@/lib/access";
import { passkeyList } from "@/lib/auth/passkeys";
import { recentImports } from "@/lib/banks/imports";
import type { Db } from "@/lib/db";
import { categories, rules } from "@/lib/db/schema";
import { formatShortDate, todayIn } from "@/lib/money";
import type { AccountItem } from "./AccountsList";
import type { PasskeyItem } from "./Passkeys";
import { accountLine, importLine } from "./words";

/** The viewer's own accounts, ready for the list. */
export async function accountItems(db: Db, viewer: Viewer): Promise<AccountItem[]> {
  return (await ownAccounts(db, viewer)).map((account) => ({
    id: account.id,
    name: account.name,
    line: accountLine(account),
    icon: accountIcon(account),
    balanceCents: account.balanceCents,
    includeInBudgets: account.includeInBudgets,
    archived: account.archived,
    live: account.live,
  }));
}

/** A user's passkeys, oldest first: "iPhone", "Added Sat 10 Oct · Last used Sun 11 Oct". */
export async function passkeyItems(
  db: Db,
  userId: string,
  timeZone: string,
): Promise<PasskeyItem[]> {
  const day = (at: Date) => formatShortDate(todayIn(timeZone, at));
  return (await passkeyList(db, userId)).map((key) => ({
    id: key.id,
    label: key.label ?? "Passkey",
    detail: `Added ${day(key.createdAt)} · ${key.lastUsedAt ? `Last used ${day(key.lastUsedAt)}` : "Not used yet"}`,
  }));
}

/** "westpac-sep.csv, 214 rows, 12 skipped because they were already here", or null. */
export async function lastImport(db: Db, viewer: Viewer): Promise<string | null> {
  const [last] = await recentImports(db, viewer, 1);
  return last ? importLine(last) : null;
}

/** How many categories and rules the household has, for the Categories and rules row. */
export async function sortingCounts(
  db: Db,
  viewer: Viewer,
): Promise<{ categories: number; rules: number }> {
  const [[c], [r]] = await Promise.all([
    db
      .select({ n: count() })
      .from(categories)
      .where(and(eq(categories.householdId, viewer.householdId), eq(categories.archived, false))),
    db.select({ n: count() }).from(rules).where(eq(rules.householdId, viewer.householdId)),
  ]);
  return { categories: c?.n ?? 0, rules: r?.n ?? 0 };
}
