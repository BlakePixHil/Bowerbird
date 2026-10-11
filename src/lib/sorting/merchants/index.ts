import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { Viewer } from "@/lib/access";
import type { Db } from "@/lib/db";
import { members, merchants, transactions } from "@/lib/db/schema";
import type { PlainDate } from "@/lib/money";
import type { SortingRow, SortingStep } from "..";
import { shopFor, type Shop } from "./clean";

export { loose, shopFor, shopText, tidyName, type Shop } from "./clean";

/**
 * The first sorting step: each row gets the shop it's from. A shop is found by its key, so a name
 * someone gave it carries on to every new row from it. A preview finds shops but creates none, and
 * names a new one by its tidy name with no id.
 */
export const cleanShopNames: SortingStep = async ({ db, householdId, save }, rows) => {
  const shops = rows.map((row) => (row.merchant ? null : shopFor(row.description)));
  const wanted = new Map<string, Shop>();
  for (const shop of shops)
    if (shop && !wanted.has(shop.matchText)) wanted.set(shop.matchText, shop);
  if (wanted.size === 0) return;

  const keys = [...wanted.keys()];
  if (save)
    await db
      .insert(merchants)
      .values(
        [...wanted.values()].map(({ matchText, name }) => ({
          householdId,
          matchText,
          displayName: name,
        })),
      )
      // A shop that's already here keeps the name it has, which may be one someone chose.
      .onConflictDoNothing();
  const found = await db
    .select({ id: merchants.id, matchText: merchants.matchText, name: merchants.displayName })
    .from(merchants)
    .where(and(eq(merchants.householdId, householdId), inArray(merchants.matchText, keys)));
  const byKey = new Map(found.map((shop) => [shop.matchText, shop]));

  rows.forEach((row, i) => {
    const shop = shops[i];
    if (!shop) return;
    const here = byKey.get(shop.matchText);
    row.merchant = here ? { id: here.id, name: here.name } : { id: null, name: shop.name };
  });
};

/** The longest a shop's name can be. */
export const SHOP_NAME_MAX = 60;

export type RenameShop = { ok: true; name: string } | { ok: false; error: string };

/**
 * Renames one of the household's shops. Every transaction from it shows the new name, the ones
 * already here and every one still to come, because new rows find the shop by its key.
 */
export async function renameShop(
  db: Db,
  viewer: Viewer,
  merchantId: string,
  name: string,
): Promise<RenameShop> {
  const tidy = name.replace(/\s+/g, " ").trim();
  if (!tidy) return { ok: false, error: "Give the shop a name." };
  if (tidy.length > SHOP_NAME_MAX)
    return { ok: false, error: `Keep the name to ${SHOP_NAME_MAX} characters or fewer.` };
  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, viewer.memberId), eq(members.householdId, viewer.householdId)));
  const renamed = member
    ? await db
        .update(merchants)
        .set({ displayName: tidy })
        .where(and(eq(merchants.id, merchantId), eq(merchants.householdId, viewer.householdId)))
        .returning({ id: merchants.id })
    : [];
  if (renamed.length === 0) return { ok: false, error: "That shop isn't in your household." };
  return { ok: true, name: tidy };
}

/**
 * Finds the shop for rows that came in before shops were named, newest first, within a time
 * budget. The daily job runs it, so a household's earlier rows get their shop names too. Only
 * sets the shop: categories and transfers stay as they are.
 */
export async function nameShops(
  db: Db,
  options: { householdId?: string; budgetMs?: number; pageRows?: number; now?: () => number } = {},
): Promise<{ named: number; left: boolean }> {
  const clock = options.now ?? Date.now;
  const startedAt = clock();
  const budget = options.budgetMs ?? 5_000;
  const pageRows = options.pageRows ?? 1_000;
  let after: { date: PlainDate; id: string } | null = null;
  let named = 0;

  for (;;) {
    if (clock() - startedAt >= budget) return { named, left: true };
    const page: (SortingRow & { id: string; householdId: string })[] = await db
      .select({
        id: transactions.id,
        householdId: transactions.householdId,
        accountId: transactions.accountId,
        date: transactions.date,
        amountCents: transactions.amountCents,
        description: transactions.descriptionRaw,
      })
      .from(transactions)
      .where(
        and(
          isNull(transactions.merchantId),
          options.householdId ? eq(transactions.householdId, options.householdId) : undefined,
          after
            ? or(
                lt(transactions.date, after.date),
                and(eq(transactions.date, after.date), lt(transactions.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(pageRows);

    const households = Map.groupBy(page, (row) => row.householdId);
    for (const [householdId, rows] of households) {
      const sorting: SortingRow[] = rows.map((row) => ({
        id: row.id,
        accountId: row.accountId,
        date: row.date,
        amountCents: row.amountCents,
        description: row.description,
      }));
      await cleanShopNames({ db, householdId, save: true }, sorting);
      const byShop = Map.groupBy(
        sorting.filter((row) => row.merchant?.id),
        (row) => row.merchant!.id!,
      );
      for (const [merchantId, shopRows] of byShop) {
        const ids = shopRows.map((row) => row.id!);
        await db
          .update(transactions)
          .set({ merchantId })
          .where(and(inArray(transactions.id, ids), isNull(transactions.merchantId)));
        named += ids.length;
      }
    }
    if (page.length < pageRows) return { named, left: false };
    const { date, id } = page.at(-1)!;
    after = { date, id };
  }
}
