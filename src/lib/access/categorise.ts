import { and, asc, count, eq, inArray, isNull, ne, notExists, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { categories, members, merchants, splits, transactions } from "@/lib/db/schema";
import { assignColours } from "@/lib/sorting/categories";
import { addToRuleCount, saveShopRule, shopRules } from "@/lib/sorting/rules";
import { visibleAccounts, type Viewer } from "./accounts";
import type { ActivityCategory } from "./activity";

/** A category someone can pick, in the household's order. */
export type CategoryChoice = ActivityCategory & { sortOrder: number };

async function isMember(db: Db, viewer: Viewer): Promise<boolean> {
  const [found] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, viewer.memberId), eq(members.householdId, viewer.householdId)));
  return !!found;
}

/** The household's categories that can be picked, in their order. Nothing for a stranger. */
export async function categoryChoices(db: Db, viewer: Viewer): Promise<CategoryChoice[]> {
  if (!(await isMember(db, viewer))) return [];
  return db
    .select({
      id: categories.id,
      name: categories.name,
      kind: categories.kind,
      icon: categories.icon,
      colourSlot: categories.colourSlot,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .where(and(eq(categories.householdId, viewer.householdId), eq(categories.archived, false)))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

/** A category in the viewer's household that can be picked, or null. */
async function pickable(db: Db, viewer: Viewer, categoryId: string) {
  const [category] = await db
    .select({
      id: categories.id,
      name: categories.name,
      kind: categories.kind,
      icon: categories.icon,
      colourSlot: categories.colourSlot,
    })
    .from(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.householdId, viewer.householdId),
        eq(categories.archived, false),
      ),
    );
  return category ?? null;
}

/** The accounts whose rows the viewer sees in full, and so may change. */
async function fullAccounts(db: Db, viewer: Viewer): Promise<string[]> {
  const seen = await visibleAccounts(db, viewer);
  return seen.filter((account) => account.access === "full").map((account) => account.id);
}

/**
 * The shop's rows the viewer can see that aren't in the category yet: not split (a split row's
 * categories are its parts) and not a matched transfer. "Also change the earlier ones" moves these.
 */
function notYetIn(
  db: Db,
  merchantId: string,
  categoryId: string,
  accountIds: string[],
  except: string | null,
) {
  return and(
    eq(transactions.merchantId, merchantId),
    inArray(transactions.accountId, accountIds),
    isNull(transactions.transferGroupId),
    sql`${transactions.categoryId} is distinct from ${categoryId}`,
    except ? ne(transactions.id, except) : undefined,
    notExists(
      db.select({ id: splits.id }).from(splits).where(eq(splits.transactionId, transactions.id)),
    ),
  );
}

export type Categorised =
  | {
      ok: true;
      category: ActivityCategory;
      /** The row's shop, when it has one, for "Always put Woolworths in Groceries?". */
      shop: { id: string; name: string } | null;
      /** The shop's other rows the viewer can see that aren't in this category. */
      earlier: number;
      /** The shop's rule already sorts it into this category, so there's nothing to ask. */
      ruled: boolean;
    }
  | { ok: false; error: string };

/**
 * Puts one transaction in a category. The viewer must see its account in full, and the category
 * must be one of the household's. A split row stops being split. Says what to ask next: whether
 * to sort the shop this way always. Doing it twice gives the same result, so a change queued
 * offline can be sent again safely.
 */
export async function categoriseTransaction(
  db: Db,
  viewer: Viewer,
  transactionId: string,
  categoryId: string,
): Promise<Categorised> {
  const accountIds = await fullAccounts(db, viewer);
  const category = await pickable(db, viewer, categoryId);
  if (!category) return { ok: false, error: "That category isn't in your household." };
  const [row] =
    accountIds.length === 0
      ? []
      : await db
          .select({
            id: transactions.id,
            merchantId: transactions.merchantId,
            shop: merchants.displayName,
          })
          .from(transactions)
          .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
          .where(
            and(eq(transactions.id, transactionId), inArray(transactions.accountId, accountIds)),
          );
  if (!row) return { ok: false, error: "That transaction isn't one you can change." };
  // One category for the whole row replaces any split it had, as the boards do.
  await db.transaction(async (tx) => {
    await tx.delete(splits).where(eq(splits.transactionId, row.id));
    await tx
      .update(transactions)
      .set({ categoryId })
      .where(and(eq(transactions.id, row.id), eq(transactions.householdId, viewer.householdId)));
  });
  await assignColours(db, viewer.householdId);
  const coloured = (await pickable(db, viewer, categoryId)) ?? category;

  if (!row.merchantId || !row.shop)
    return { ok: true, category: coloured, shop: null, earlier: 0, ruled: false };
  const [earlier] = await db
    .select({ n: count() })
    .from(transactions)
    .where(notYetIn(db, row.merchantId, categoryId, accountIds, row.id));
  const ruled = (await shopRules(db, viewer.householdId, [row.merchantId])).get(row.merchantId);
  return {
    ok: true,
    category: coloured,
    shop: { id: row.merchantId, name: row.shop },
    earlier: earlier?.n ?? 0,
    ruled: ruled === categoryId,
  };
}

export type ShopSorted =
  | {
      ok: true;
      category: ActivityCategory;
      /** The rows this moved into the category. */
      changed: string[];
      /** How many of the shop's rows the viewer can see are now in the category. */
      inCategory: number;
    }
  | { ok: false; error: string };

/**
 * "Yes, always": saves the shop's rule, so new rows from it are sorted into the category, and with
 * `earlier`, moves the shop's rows the viewer can see into it too. Rows in accounts the viewer
 * can't see are left as they are. Safe to send twice.
 */
export async function sortShopAlways(
  db: Db,
  viewer: Viewer,
  merchantId: string,
  categoryId: string,
  earlier: boolean,
): Promise<ShopSorted> {
  const category = await pickable(db, viewer, categoryId);
  if (!category || !(await isMember(db, viewer)))
    return { ok: false, error: "That category isn't in your household." };
  const [shop] = await db
    .select({ id: merchants.id })
    .from(merchants)
    .where(and(eq(merchants.id, merchantId), eq(merchants.householdId, viewer.householdId)));
  if (!shop) return { ok: false, error: "That shop isn't in your household." };

  const accountIds = await fullAccounts(db, viewer);
  return db.transaction(async (tx) => {
    const ruleId = await saveShopRule(tx, viewer.householdId, merchantId, categoryId);
    const changed =
      earlier && accountIds.length > 0
        ? await tx
            .update(transactions)
            .set({ categoryId })
            .where(notYetIn(tx, merchantId, categoryId, accountIds, null))
            .returning({ id: transactions.id })
        : [];
    await addToRuleCount(tx, ruleId, changed.length);
    await assignColours(tx, viewer.householdId);
    const [inCategory] =
      accountIds.length === 0
        ? [{ n: 0 }]
        : await tx
            .select({ n: count() })
            .from(transactions)
            .where(
              and(
                eq(transactions.merchantId, merchantId),
                eq(transactions.categoryId, categoryId),
                inArray(transactions.accountId, accountIds),
              ),
            );
    return {
      ok: true as const,
      category: (await pickable(tx, viewer, categoryId)) ?? category,
      changed: changed.map((row) => row.id),
      inCategory: inCategory?.n ?? 0,
    };
  });
}
