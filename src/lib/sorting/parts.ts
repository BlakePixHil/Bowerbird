import { eq, sql } from "drizzle-orm";
import { splits, transactions } from "@/lib/db/schema";

/**
 * How every total counts a split: a split row by its parts, never by the row's own category, and
 * any other row by its category. Left-join `splits` on `partsJoin`, then group and sum by
 * `partCategory` and `partCents`. A split row comes back once per part, so count transactions with
 * `countDistinct(transactions.id)`. Budgets and reports use the same three, so a split counts the
 * same way on every screen.
 */
export const partsJoin = eq(splits.transactionId, transactions.id);

/** The part's category for a split row, otherwise the row's own. */
export const partCategory = sql<
  string | null
>`coalesce(${splits.categoryId}, ${transactions.categoryId})`;

/** The part's signed cents for a split row, otherwise the row's own. */
export const partCents = sql<number>`coalesce(${splits.amountCents}, ${transactions.amountCents})`;
