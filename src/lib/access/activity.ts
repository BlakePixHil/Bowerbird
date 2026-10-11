import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  min,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  categories,
  merchants,
  splits,
  tags,
  transactions,
  transactionTags,
} from "@/lib/db/schema";
import { parseMoney, type DaySpend, type PlainDate } from "@/lib/money";
import { countedMoney, isCounted } from "@/lib/sorting/transfers";
import { scopeFor, type SeenAccount, type View, type Viewer, type Whose } from "./accounts";
import { partsOf } from "./details";

/**
 * Reads for Activity: one list of every transaction the viewer can see, a page of whole days at a
 * time, plus the counts and daily spending around it. Only accounts the viewer sees in full count,
 * as with `transactionsFor`.
 */

/** What Activity is narrowed to. Every filter given must match, together with the search. */
export type ActivityFilters = {
  /** A shop, some bank text, a tag, a note, or an amount such as 86.20 or $86. */
  search?: string;
  /** Only rows with no category yet that aren't transfers. */
  toCheck?: boolean;
  /** Only the viewer's own accounts. */
  mineOnly?: boolean;
  /** Only these accounts. Any the viewer can't see in full are left out, and none means nothing. */
  accountIds?: readonly string[];
  /** Rows in any of these categories. A split row matches by any of its parts. */
  categoryIds?: readonly string[];
  /** Rows with any of these tags. */
  tagIds?: readonly string[];
  /** The first and last day, each included. */
  from?: PlainDate;
  to?: PlainDate;
  /** The amount's size in cents, whichever way the money went, each end included. */
  minCents?: number;
  maxCents?: number;
  direction?: "in" | "out";
  /** False leaves out transfers between the household's own accounts. */
  transfers?: boolean;
  /** False leaves out rows the bank hasn't settled yet. */
  pending?: boolean;
};

export type ActivityCategory = {
  id: string;
  name: string;
  kind: "spending" | "income" | "transfer";
  icon: string | null;
  colourSlot: number | null;
};

/** One part of a split row: its category and its share, in signed cents like the row. */
export type SplitPart = { category: ActivityCategory; cents: number };

export type TagRef = { id: string; name: string };

export type ActivityRow = {
  id: string;
  date: PlainDate;
  /** Signed cents. Negative is money out. */
  amountCents: number;
  /** The bank's own words. */
  description: string;
  /** The shop's clean name when it's known, otherwise the bank's words. */
  shop: string;
  category: ActivityCategory | null;
  pending: boolean;
  /** Money moving between the household's own accounts: never spending or income. */
  notCounted: boolean;
  /** Matched with the other side of a transfer, so it isn't counted whatever its category. */
  paired: boolean;
  /** Its parts when it's split across categories, biggest first; otherwise empty. */
  parts: SplitPart[];
  tags: TagRef[];
  note: string | null;
  source: "sync" | "file";
  account: { id: string; name: string; institution: string | null };
  whose: Whose;
};

export type ActivityPage = {
  /** Newest first: by date, then id. */
  rows: ActivityRow[];
  /** Pass as `before` for the next page, or null when there's nothing older. */
  next: PlainDate | null;
};

/** About how many rows a page holds. Pages end on a whole day, so a page can hold a few more. */
export const ACTIVITY_PAGE_ROWS = 100;

/**
 * The accounts in a view whose transactions the viewer may see, narrowed to the ones the filters
 * pick.
 */
async function fullAccounts(
  db: Db,
  viewer: Viewer,
  view: View,
  filters: ActivityFilters = {},
): Promise<Map<string, SeenAccount>> {
  const { accounts } = await scopeFor(db, viewer, view);
  const picked = filters.accountIds && new Set(filters.accountIds);
  return new Map(
    accounts
      .filter(
        (account) =>
          account.access === "full" &&
          (!filters.mineOnly || account.whose === "mine") &&
          (!picked || picked.has(account.id)),
      )
      .map((account) => [account.id, account]),
  );
}

/** "86.20" finds $86.20 either way; "86" or "$86" finds anything from $86.00 to $86.99. */
function amountCondition(text: string): SQL | undefined {
  if (!/^[-−]?\s*\$?\s*\d[\d,]*(\.\d{1,2})?$/.test(text)) return undefined;
  const cents = parseMoney(text.replace(/\s/g, ""));
  if (cents === null) return undefined;
  const size = Math.abs(cents);
  const absolute = sql`abs(${transactions.amountCents})`;
  return text.includes(".")
    ? sql`${absolute} = ${size}`
    : sql`${absolute} between ${size} and ${size + 99}`;
}

function searchCondition(search: string | undefined): SQL | undefined {
  const text = search?.trim();
  if (!text) return undefined;
  const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return or(
    ilike(transactions.descriptionRaw, like),
    ilike(transactions.note, like),
    sql`exists (select 1 from ${merchants} where ${merchants.id} = ${transactions.merchantId} and ${merchants.displayName} ilike ${like})`,
    sql`exists (select 1 from ${transactionTags} join ${tags} on ${tags.id} = ${transactionTags.tagId} where ${transactionTags.transactionId} = ${transactions.id} and ${tags.name} ilike ${like})`,
    amountCondition(text),
  );
}

const some = (ids: readonly string[] | undefined): ids is readonly string[] =>
  ids !== undefined && ids.length > 0;

/**
 * The one query builder for Activity's filters: every filter given, together, as SQL. Accounts
 * are picked before this, by `fullAccounts`.
 */
function matching(viewer: Viewer, accountIds: string[], filters: ActivityFilters) {
  const size = sql`abs(${transactions.amountCents})`;
  const { categoryIds, tagIds } = filters;
  return and(
    eq(transactions.householdId, viewer.householdId),
    inArray(transactions.accountId, accountIds),
    searchCondition(filters.search),
    filters.toCheck
      ? and(isNull(transactions.categoryId), isNull(transactions.transferGroupId))
      : undefined,
    some(categoryIds)
      ? or(
          inArray(transactions.categoryId, [...categoryIds]),
          sql`exists (select 1 from ${splits} where ${splits.transactionId} = ${transactions.id} and ${inArray(splits.categoryId, [...categoryIds])})`,
        )
      : undefined,
    some(tagIds)
      ? sql`exists (select 1 from ${transactionTags} where ${transactionTags.transactionId} = ${transactions.id} and ${inArray(transactionTags.tagId, [...tagIds])})`
      : undefined,
    filters.from ? gte(transactions.date, filters.from) : undefined,
    filters.to ? lte(transactions.date, filters.to) : undefined,
    filters.minCents !== undefined ? sql`${size} >= ${filters.minCents}` : undefined,
    filters.maxCents !== undefined ? sql`${size} <= ${filters.maxCents}` : undefined,
    filters.direction === "in" ? gt(transactions.amountCents, 0) : undefined,
    filters.direction === "out" ? lt(transactions.amountCents, 0) : undefined,
    filters.transfers === false ? countedMoney() : undefined,
    filters.pending === false ? eq(transactions.pending, false) : undefined,
  );
}

/**
 * One page of Activity, newest first. A page ends on a whole day, so each day's rows (and its
 * total) are complete, and `next` is the day the next page starts before.
 */
export async function activityPage(
  db: Db,
  viewer: Viewer,
  view: View,
  filters: ActivityFilters = {},
  before?: PlainDate,
  pageRows = ACTIVITY_PAGE_ROWS,
): Promise<ActivityPage> {
  const seen = await fullAccounts(db, viewer, view, filters);
  if (seen.size === 0) return { rows: [], next: null };
  const where = matching(viewer, [...seen.keys()], filters);

  // Each day has at least one row, so pageRows + 1 days is always enough to fill a page and see
  // whether anything is left after it.
  const days = await db
    .select({ date: transactions.date, rows: count() })
    .from(transactions)
    .where(and(where, before ? lt(transactions.date, before) : undefined))
    .groupBy(transactions.date)
    .orderBy(desc(transactions.date))
    .limit(pageRows + 1);
  if (days.length === 0) return { rows: [], next: null };
  let taken = 0;
  let last = 0;
  while (last < days.length && taken < pageRows) taken += days[last++].rows;
  const newest = days[0].date;
  const oldest = days[last - 1].date;

  const found = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amountCents: transactions.amountCents,
      description: transactions.descriptionRaw,
      pending: transactions.pending,
      transferGroupId: transactions.transferGroupId,
      note: transactions.note,
      source: transactions.source,
      shop: merchants.displayName,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryKind: categories.kind,
      categoryIcon: categories.icon,
      categoryColourSlot: categories.colourSlot,
    })
    .from(transactions)
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(where, gte(transactions.date, oldest), lte(transactions.date, newest)))
    .orderBy(desc(transactions.date), desc(transactions.id));

  const ids = found.map((row) => row.id);
  const [tagRows, partRows] = await Promise.all([
    db
      .select({ transactionId: transactionTags.transactionId, id: tags.id, name: tags.name })
      .from(transactionTags)
      .innerJoin(tags, eq(tags.id, transactionTags.tagId))
      .where(inArray(transactionTags.transactionId, ids))
      .orderBy(asc(sql`lower(${tags.name})`)),
    partsOf(db, ids),
  ]);
  const tagsOf = new Map<string, TagRef[]>();
  for (const { transactionId, ...tag } of tagRows) {
    tagsOf.set(transactionId, [...(tagsOf.get(transactionId) ?? []), tag]);
  }

  const rows = found.map((row): ActivityRow => {
    const account = seen.get(row.accountId)!;
    const category: ActivityCategory | null =
      row.categoryId && row.categoryName && row.categoryKind
        ? {
            id: row.categoryId,
            name: row.categoryName,
            kind: row.categoryKind,
            icon: row.categoryIcon,
            colourSlot: row.categoryColourSlot,
          }
        : null;
    return {
      id: row.id,
      date: row.date,
      amountCents: row.amountCents,
      description: row.description,
      shop: row.shop ?? row.description,
      category,
      pending: row.pending,
      notCounted: !isCounted({ paired: row.transferGroupId !== null, kind: category?.kind }),
      paired: row.transferGroupId !== null,
      parts: partRows.get(row.id) ?? [],
      tags: tagsOf.get(row.id) ?? [],
      note: row.note,
      source: row.source,
      account: { id: account.id, name: account.name, institution: account.institution },
      whose: account.whose,
    };
  });
  return { rows, next: last < days.length ? oldest : null };
}

/** How many rows match, for "2,014 transactions". */
export async function countActivity(
  db: Db,
  viewer: Viewer,
  view: View,
  filters: ActivityFilters = {},
): Promise<number> {
  const seen = await fullAccounts(db, viewer, view, filters);
  if (seen.size === 0) return 0;
  const [row] = await db
    .select({ rows: count() })
    .from(transactions)
    .where(matching(viewer, [...seen.keys()], filters));
  return row?.rows ?? 0;
}

export type ActivityCounts = {
  /** Every transaction the viewer can see. */
  all: number;
  /** The day of the first one, or null with none. */
  since: PlainDate | null;
  /** Rows with no category that aren't transfers. */
  toCheck: number;
  byWhose: Record<Whose, number>;
};

/** The numbers on Activity's quick chips: everything, by whose it is, and what's left to check. */
export async function activityCounts(db: Db, viewer: Viewer): Promise<ActivityCounts> {
  const counts: ActivityCounts = {
    all: 0,
    since: null,
    toCheck: 0,
    byWhose: { mine: 0, partner: 0, shared: 0 },
  };
  const seen = await fullAccounts(db, viewer, "household");
  if (seen.size === 0) return counts;
  const rows = await db
    .select({
      accountId: transactions.accountId,
      rows: count(),
      since: min(transactions.date),
      toCheck:
        sql<number>`count(*) filter (where ${transactions.categoryId} is null and ${transactions.transferGroupId} is null)`.mapWith(
          Number,
        ),
    })
    .from(transactions)
    .where(matching(viewer, [...seen.keys()], {}))
    .groupBy(transactions.accountId);
  for (const row of rows) {
    counts.all += row.rows;
    if (row.since && (counts.since === null || row.since < counts.since)) counts.since = row.since;
    counts.toCheck += row.toCheck;
    counts.byWhose[seen.get(row.accountId)!.whose] += row.rows;
  }
  return counts;
}

export type InOut = {
  /** Positive cents that came in, and went out. */
  in: number;
  out: number;
};

/**
 * Money in and money out over some days in one view, both ends included. Transfers between the
 * household's own accounts are left out and pending rows count, so it matches Activity filtered to
 * the same days, money in or out, without transfers.
 */
export async function moneyInOut(
  db: Db,
  viewer: Viewer,
  view: View,
  range: { from: PlainDate; to: PlainDate },
): Promise<InOut> {
  const seen = await fullAccounts(db, viewer, view);
  if (seen.size === 0) return { in: 0, out: 0 };
  const amount = transactions.amountCents;
  const [row] = await db
    .select({
      in: sql<number>`coalesce(sum(${amount}) filter (where ${amount} > 0), 0)`.mapWith(Number),
      out: sql<number>`coalesce(sum(-${amount}) filter (where ${amount} < 0), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(
      matching(viewer, [...seen.keys()], { from: range.from, to: range.to, transfers: false }),
    );
  return { in: row?.in ?? 0, out: row?.out ?? 0 };
}

/** Money in and out for one calendar month, such as "2026-09". */
export type MonthInOut = InOut & { month: string };

/**
 * Money in and out for each calendar month that has any, oldest first, by the same rules as
 * `moneyInOut`, so a month here matches `moneyInOut` over that month's days.
 */
export async function monthlyInOut(
  db: Db,
  viewer: Viewer,
  view: View,
  range: { from: PlainDate; to: PlainDate },
): Promise<MonthInOut[]> {
  const seen = await fullAccounts(db, viewer, view);
  if (seen.size === 0) return [];
  const amount = transactions.amountCents;
  const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`;
  return db
    .select({
      month,
      in: sql<number>`coalesce(sum(${amount}) filter (where ${amount} > 0), 0)`.mapWith(Number),
      out: sql<number>`coalesce(sum(-${amount}) filter (where ${amount} < 0), 0)`.mapWith(Number),
    })
    .from(transactions)
    .where(matching(viewer, [...seen.keys()], { from: range.from, to: range.to, transfers: false }))
    .groupBy(month)
    .orderBy(month);
}

export type DailySpending = {
  /** Days with any spending, oldest first, in positive cents. */
  days: DaySpend[];
  /** The view's first transaction of any kind, or null when it has none. */
  since: PlainDate | null;
};

/**
 * Spending per day in one view: money out that isn't a transfer between the household's own
 * accounts, pending included. The same rule as `spentBy`, so a week's total here matches the
 * day totals on the list.
 */
export async function dailySpending(
  db: Db,
  viewer: Viewer,
  view: View,
  range: { from: PlainDate; to: PlainDate },
): Promise<DailySpending> {
  const seen = await fullAccounts(db, viewer, view);
  if (seen.size === 0) return { days: [], since: null };
  const where = matching(viewer, [...seen.keys()], {});
  const [days, [first]] = await Promise.all([
    db
      .select({
        date: transactions.date,
        cents: sql<number>`sum(-${transactions.amountCents})`.mapWith(Number),
      })
      .from(transactions)
      .where(
        and(
          where,
          gte(transactions.date, range.from),
          lte(transactions.date, range.to),
          lt(transactions.amountCents, 0),
          countedMoney(),
        ),
      )
      .groupBy(transactions.date)
      .orderBy(asc(transactions.date)),
    db
      .select({ since: min(transactions.date) })
      .from(transactions)
      .where(where),
  ]);
  return { days, since: first?.since ?? null };
}
