import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { categories, rules, tags } from "@/lib/db/schema";
import type { SortingRow, SortingStep } from "..";
import { loose } from "../merchants";

/** An enabled rule, ready to match rows. */
export type ActiveRule = {
  id: string;
  /** Matches rows from this shop. */
  merchantId: string | null;
  /** Or failing a shop, rows whose bank text has these words, in `loose` form. */
  matchText: string | null;
  category: NonNullable<SortingRow["category"]>;
  tag: NonNullable<SortingRow["tag"]> | null;
};

/** The household's enabled rules in the order they run: lowest position first, then oldest. */
export async function activeRules(db: Db, householdId: string): Promise<ActiveRule[]> {
  const found = await db
    .select({
      id: rules.id,
      merchantId: rules.merchantId,
      matchText: rules.matchText,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryKind: categories.kind,
      categoryIcon: categories.icon,
      categoryColourSlot: categories.colourSlot,
      tagId: tags.id,
      tagName: tags.name,
    })
    .from(rules)
    .innerJoin(categories, eq(categories.id, rules.categoryId))
    .leftJoin(tags, eq(tags.id, rules.tagId))
    .where(
      and(
        eq(rules.householdId, householdId),
        eq(rules.enabled, true),
        eq(categories.archived, false),
      ),
    )
    .orderBy(asc(rules.position), asc(rules.createdAt), asc(rules.id));
  return found.map((rule) => ({
    id: rule.id,
    merchantId: rule.merchantId,
    matchText: rule.matchText ? loose(rule.matchText) : null,
    category: {
      id: rule.categoryId,
      name: rule.categoryName,
      kind: rule.categoryKind,
      icon: rule.categoryIcon,
      colourSlot: rule.categoryColourSlot,
    },
    tag: rule.tagId && rule.tagName ? { id: rule.tagId, name: rule.tagName } : null,
  }));
}

/** The first rule that matches a row: its shop's rule, or one whose words are in its bank text. */
export function ruleFor(rules: readonly ActiveRule[], row: SortingRow): ActiveRule | null {
  const shop = row.merchant?.id ?? null;
  const text = ` ${loose(row.description)} `;
  return (
    rules.find((rule) =>
      rule.merchantId
        ? rule.merchantId === shop
        : !!rule.matchText && text.includes(` ${rule.matchText} `),
    ) ?? null
  );
}

/**
 * The second sorting step: each row with no category yet gets the category, and tag, of the first
 * enabled rule that matches it. Saving counts how many rows each rule has sorted.
 */
export const applyRules: SortingStep = async ({ db, householdId, save }, rows) => {
  const waiting = rows.filter((row) => !row.category && !row.transferGroupId);
  if (waiting.length === 0) return;
  const active = await activeRules(db, householdId);
  if (active.length === 0) return;

  const sorted = new Map<string, number>();
  for (const row of waiting) {
    const rule = ruleFor(active, row);
    if (!rule) continue;
    row.category = { ...rule.category };
    if (rule.tag) row.tag = { ...rule.tag };
    sorted.set(rule.id, (sorted.get(rule.id) ?? 0) + 1);
  }
  if (save) for (const [id, count] of sorted) await addToRuleCount(db, id, count);
};

/**
 * Makes sure the household sorts a shop into a category from now on: the shop's rule, updated if
 * it has one, otherwise a new one after the others. Turns the rule back on if it was off.
 */
export async function saveShopRule(
  db: Db,
  householdId: string,
  merchantId: string,
  categoryId: string,
): Promise<string> {
  const [last] = await db
    .select({ position: max(rules.position) })
    .from(rules)
    .where(eq(rules.householdId, householdId));
  const [rule] = await db
    .insert(rules)
    .values({ householdId, merchantId, categoryId, position: (last?.position ?? -1) + 1 })
    .onConflictDoUpdate({
      target: [rules.householdId, rules.merchantId],
      targetWhere: sql`${rules.merchantId} is not null`,
      set: { categoryId, enabled: true },
    })
    .returning({ id: rules.id });
  return rule.id;
}

/** Adds to how many rows a rule has sorted. */
export async function addToRuleCount(db: Db, ruleId: string, count: number): Promise<void> {
  if (count > 0)
    await db
      .update(rules)
      .set({ appliedCount: sql`${rules.appliedCount} + ${count}` })
      .where(eq(rules.id, ruleId));
}

/** The category each of these shops' rules sorts into, for shops that have an enabled rule. */
export async function shopRules(
  db: Db,
  householdId: string,
  merchantIds: readonly string[],
): Promise<Map<string, string>> {
  if (merchantIds.length === 0) return new Map();
  const found = await db
    .select({ merchantId: rules.merchantId, categoryId: rules.categoryId })
    .from(rules)
    .where(
      and(
        eq(rules.householdId, householdId),
        eq(rules.enabled, true),
        inArray(rules.merchantId, [...merchantIds]),
      ),
    );
  return new Map(found.map((rule) => [rule.merchantId!, rule.categoryId]));
}
