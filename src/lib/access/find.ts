import { addDays, addMonths, isPlainDate, type PlainDate } from "@/lib/money";
import type { ActivityFilters } from "./activity";

/**
 * Activity's filters as someone picks them on the "Find transactions" boards. The same shape is
 * in the address, in a saved view and in the sheet while it's open, and `findFilters` turns it
 * into the access helper's filters. Safe in the browser.
 */

export type DateRange = "month" | "last" | "3m" | "custom";

export const DATE_RANGES: readonly DateRange[] = ["month", "last", "3m", "custom"];

export type Direction = "both" | "in" | "out";

export type Find = {
  /** Only the viewer's own accounts. */
  mine: boolean;
  /** Only these accounts, or null for every account. */
  accounts: string[] | null;
  /** Any of these categories, or any category when empty. */
  categories: string[];
  /** Any of these tags, or any tag (or none) when empty. */
  tags: string[];
  /** A range counted from today, or custom from `from` to `to`, or null for any time. */
  range: DateRange | null;
  from: PlainDate | null;
  to: PlainDate | null;
  /** The amount's size in cents, whichever way the money went. */
  min: number | null;
  max: number | null;
  direction: Direction;
  /** Whether transfers between the household's own accounts show. */
  transfers: boolean;
  /** Whether rows the bank hasn't settled yet show. */
  pending: boolean;
};

/** No filters: everything shows. */
export const ANYTHING: Find = {
  mine: false,
  accounts: null,
  categories: [],
  tags: [],
  range: null,
  from: null,
  to: null,
  min: null,
  max: null,
  direction: "both",
  transfers: true,
  pending: true,
};

/** What a saved view keeps: the search words as well as the filters. */
export type SavedFilters = { search: string; find: Find };

/** No list of accounts, categories or tags holds more than this. */
export const FIND_MAX_IDS = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string => typeof id === "string" && UUID.test(id));
  return [...new Set(ids.map((id) => id.toLowerCase()))].slice(0, FIND_MAX_IDS);
}

const dateOf = (value: unknown) => (typeof value === "string" && isPlainDate(value) ? value : null);

const centsOf = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

/**
 * Filters from anywhere (the address, a saved view, the sheet) with anything that doesn't fit
 * left out. Dates or amounts the wrong way round are swapped.
 */
export function cleanFind(value: unknown): Find {
  const v = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const range = DATE_RANGES.includes(v.range as DateRange) ? (v.range as DateRange) : null;
  let from = range === "custom" ? dateOf(v.from) : null;
  let to = range === "custom" ? dateOf(v.to) : null;
  if (from && to && from > to) [from, to] = [to, from];
  let min = centsOf(v.min);
  let max = centsOf(v.max);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  return {
    mine: v.mine === true,
    accounts: Array.isArray(v.accounts) ? idList(v.accounts) : null,
    categories: idList(v.categories),
    tags: idList(v.tags),
    range,
    from,
    to,
    min,
    max,
    direction: v.direction === "in" || v.direction === "out" ? v.direction : "both",
    transfers: v.transfers !== false,
    pending: v.pending !== false,
  };
}

/** A saved view's filters, read back from the database. */
export function cleanSaved(value: unknown): SavedFilters {
  const v = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    search: typeof v.search === "string" ? v.search.trim().slice(0, 100) : "",
    find: cleanFind(v.find),
  };
}

/**
 * The first and last day a date range covers, from the household's today. "This month" and "Last
 * 3 months" have no last day, so a row the bank dates ahead still shows.
 */
export function rangeDays(
  find: Pick<Find, "range" | "from" | "to">,
  today: PlainDate,
): { from: PlainDate | null; to: PlainDate | null } {
  const firstOfMonth = addMonths(today, 0, 1);
  switch (find.range) {
    case "month":
      return { from: firstOfMonth, to: null };
    case "last":
      return { from: addMonths(today, -1, 1), to: addDays(firstOfMonth, -1) };
    case "3m":
      return { from: addDays(addMonths(today, -3), 1), to: null };
    case "custom":
      return { from: find.from, to: find.to };
    default:
      return { from: null, to: null };
  }
}

/** The access helper's filters for these. */
export function findFilters(find: Find, today: PlainDate): ActivityFilters {
  const { from, to } = rangeDays(find, today);
  return {
    mineOnly: find.mine || undefined,
    accountIds: find.accounts ?? undefined,
    categoryIds: find.categories.length > 0 ? find.categories : undefined,
    tagIds: find.tags.length > 0 ? find.tags : undefined,
    from: from ?? undefined,
    to: to ?? undefined,
    minCents: find.min ?? undefined,
    maxCents: find.max ?? undefined,
    direction: find.direction === "both" ? undefined : find.direction,
    transfers: find.transfers ? undefined : false,
    pending: find.pending ? undefined : false,
  };
}

/**
 * Leaves out accounts, categories and tags that aren't on offer, such as a category merged away
 * since a view was saved. Picking every account is the same as not picking.
 */
export function knownFind(
  find: Find,
  known: { accounts: readonly string[]; categories: readonly string[]; tags: readonly string[] },
): Find {
  const keep = (ids: string[], of: readonly string[]) => ids.filter((id) => of.includes(id));
  const accounts = find.accounts && keep(find.accounts, known.accounts);
  return {
    ...find,
    accounts: accounts && accounts.length === known.accounts.length ? null : accounts,
    categories: keep(find.categories, known.categories),
    tags: keep(find.tags, known.tags),
  };
}
