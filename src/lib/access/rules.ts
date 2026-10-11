import { and, asc, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { categories, members, merchants, rules, tags, transactions } from "@/lib/db/schema";
import { loose, shopFor } from "@/lib/sorting/merchants";
import { scopeFor, type Viewer } from "./accounts";
import type { ActivityCategory } from "./activity";

/**
 * Rules and shop names as the viewer sees them. Both belong to the household, but a shop only
 * shows when it's in an account the viewer sees in full, so a partner's private shopping stays
 * private. For the same reason "sorted" counts only rows the viewer can see.
 */

export type RuleRow = {
  id: string;
  /** "When the shop is Woolworths", or "When it says TO JOINT" for a rule on bank text. */
  shop: { id: string; name: string } | null;
  matchText: string | null;
  category: ActivityCategory;
  tag: string | null;
  enabled: boolean;
  /** How many of the viewer's transactions it has sorted. */
  sorted: number;
  createdAt: Date;
};

export type ShopRow = {
  id: string;
  name: string;
  /** The newest bank text for it, as the bank sent it. */
  bankText: string;
  /** True when someone gave it a name, rather than the cleaned-up one. */
  renamed: boolean;
  /** The viewer's transactions from it. */
  seen: number;
  lastSeen: string;
  /** The category its rule puts it in, if it has one. */
  rule: ActivityCategory | null;
};

async function isMember(db: Db, viewer: Viewer): Promise<boolean> {
  const [found] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, viewer.memberId), eq(members.householdId, viewer.householdId)));
  return !!found;
}

async function fullAccounts(db: Db, viewer: Viewer): Promise<string[]> {
  const { accounts } = await scopeFor(db, viewer, "household");
  return accounts.filter((account) => account.access === "full").map((account) => account.id);
}

const category = {
  id: categories.id,
  name: categories.name,
  kind: categories.kind,
  icon: categories.icon,
  colourSlot: categories.colourSlot,
};

/** Shops the viewer has seen, with how often and when. */
async function seenShops(db: Db, viewer: Viewer) {
  const accountIds = await fullAccounts(db, viewer);
  if (accountIds.length === 0)
    return new Map<string, { seen: number; last: string; text: string }>();
  const rows = await db
    .select({
      merchantId: transactions.merchantId,
      seen: count(),
      last: sql<string>`max(${transactions.date})::text`,
      text: sql<string>`(array_agg(${transactions.descriptionRaw} order by ${transactions.date} desc, ${transactions.id} desc))[1]`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, viewer.householdId),
        inArray(transactions.accountId, accountIds),
        isNotNull(transactions.merchantId),
      ),
    )
    .groupBy(transactions.merchantId);
  return new Map(rows.map((row) => [row.merchantId!, row]));
}

/** The household's rules the viewer can see, busiest first, then newest. */
export async function ruleList(db: Db, viewer: Viewer): Promise<RuleRow[]> {
  if (!(await isMember(db, viewer))) return [];
  const [found, shops] = await Promise.all([
    db
      .select({
        id: rules.id,
        merchantId: rules.merchantId,
        shopName: merchants.displayName,
        matchText: rules.matchText,
        enabled: rules.enabled,
        appliedCount: rules.appliedCount,
        createdAt: rules.createdAt,
        tag: tags.name,
        category,
      })
      .from(rules)
      .innerJoin(categories, eq(categories.id, rules.categoryId))
      .leftJoin(merchants, eq(merchants.id, rules.merchantId))
      .leftJoin(tags, eq(tags.id, rules.tagId))
      .where(and(eq(rules.householdId, viewer.householdId), eq(categories.archived, false)))
      .orderBy(desc(rules.createdAt), asc(rules.id)),
    seenShops(db, viewer),
  ]);
  const visible = found.filter((rule) => !rule.merchantId || shops.has(rule.merchantId));
  const shopIds = visible.flatMap((rule) => (rule.merchantId ? [rule.merchantId] : []));
  const accountIds = await fullAccounts(db, viewer);
  const inCategory =
    shopIds.length > 0 && accountIds.length > 0
      ? await db
          .select({
            merchantId: transactions.merchantId,
            categoryId: transactions.categoryId,
            n: count(),
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.householdId, viewer.householdId),
              inArray(transactions.accountId, accountIds),
              inArray(transactions.merchantId, shopIds),
            ),
          )
          .groupBy(transactions.merchantId, transactions.categoryId)
      : [];
  const sortedBy = new Map(inCategory.map((row) => [`${row.merchantId}|${row.categoryId}`, row.n]));

  return visible
    .map((rule): RuleRow => ({
      id: rule.id,
      shop: rule.merchantId && rule.shopName ? { id: rule.merchantId, name: rule.shopName } : null,
      matchText: rule.matchText,
      category: rule.category,
      tag: rule.tag,
      enabled: rule.enabled,
      // A rule only sorts rows with no category, so what's in its category from its shop is
      // what it sorted plus any put there by hand. Without a shop, the household count.
      sorted: rule.merchantId
        ? Math.min(rule.appliedCount, sortedBy.get(`${rule.merchantId}|${rule.category.id}`) ?? 0)
        : rule.appliedCount,
      createdAt: rule.createdAt,
    }))
    .sort((a, b) => b.sorted - a.sorted);
}

/**
 * Whether someone named the shop: its name isn't the one cleaning gives its key. A name that only
 * differs in capitals or marks, such as "WOOLWORTHS", isn't a new name.
 */
const renamed = (shop: { name: string; matchText: string }) =>
  shop.name !== shopFor(shop.matchText)?.name && loose(shop.name) !== shop.matchText;

/** Every shop the viewer has seen, most seen first, with its rule if it has one. */
export async function shopList(db: Db, viewer: Viewer): Promise<ShopRow[]> {
  if (!(await isMember(db, viewer))) return [];
  const shops = await seenShops(db, viewer);
  if (shops.size === 0) return [];
  const ids = [...shops.keys()];
  const [found, ruled] = await Promise.all([
    db
      .select({ id: merchants.id, name: merchants.displayName, matchText: merchants.matchText })
      .from(merchants)
      .where(and(eq(merchants.householdId, viewer.householdId), inArray(merchants.id, ids))),
    db
      .select({ merchantId: rules.merchantId, category })
      .from(rules)
      .innerJoin(categories, eq(categories.id, rules.categoryId))
      .where(
        and(
          eq(rules.householdId, viewer.householdId),
          inArray(rules.merchantId, ids),
          eq(rules.enabled, true),
          eq(categories.archived, false),
        ),
      ),
  ]);
  const ruleOf = new Map(ruled.map((row) => [row.merchantId!, row.category]));
  return found
    .map((shop): ShopRow => {
      const seen = shops.get(shop.id)!;
      return {
        id: shop.id,
        name: shop.name,
        bankText: seen.text,
        renamed: renamed(shop),
        seen: seen.seen,
        lastSeen: seen.last,
        rule: ruleOf.get(shop.id) ?? null,
      };
    })
    .sort((a, b) => b.seen - a.seen || a.name.localeCompare(b.name));
}

// Changes -----------------------------------------------------------------------------------

export type RuleChanged = { ok: true } | { ok: false; error: string };

const notYours = { ok: false as const, error: "That rule isn't in your household." };

/** Turns a rule on or off, or changes where it puts things. Earlier rows stay as they are. */
export async function changeRule(
  db: Db,
  viewer: Viewer,
  ruleId: string,
  change: { enabled?: boolean; categoryId?: string },
): Promise<RuleChanged> {
  if (!(await isMember(db, viewer))) return notYours;
  if (change.categoryId) {
    const [target] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, change.categoryId),
          eq(categories.householdId, viewer.householdId),
          eq(categories.archived, false),
        ),
      );
    if (!target) return { ok: false, error: "That category isn't in your household." };
  }
  const changed = await db
    .update(rules)
    .set({
      ...(typeof change.enabled === "boolean" ? { enabled: change.enabled } : {}),
      ...(change.categoryId ? { categoryId: change.categoryId } : {}),
    })
    .where(and(eq(rules.id, ruleId), eq(rules.householdId, viewer.householdId)))
    .returning({ id: rules.id });
  return changed.length > 0 ? { ok: true } : notYours;
}

/** Deletes a rule. What it already sorted stays sorted. */
export async function deleteRule(db: Db, viewer: Viewer, ruleId: string): Promise<RuleChanged> {
  if (!(await isMember(db, viewer))) return notYours;
  const removed = await db
    .delete(rules)
    .where(and(eq(rules.id, ruleId), eq(rules.householdId, viewer.householdId)))
    .returning({ id: rules.id });
  return removed.length > 0 ? { ok: true } : notYours;
}
