import type { DataColour } from "@/components/ui";
import type { CategoryChoice, TagRef, Whose } from "@/lib/access";
import {
  cleanFind,
  rangeDays,
  type DateRange,
  type Find,
  type SavedFilters,
} from "@/lib/access/find";
import { VIEW_NAME_MAX } from "@/lib/access/limits";
import { formatMoney, formatShortDate, parts, type PlainDate } from "@/lib/money";
import { categoryColour } from "@/lib/sorting/colour";

/**
 * The words and addresses for Activity's filters, from the "Find transactions" boards: how they
 * sit in the address, their chips under "Filtered by", and a name for a saved view.
 */

/** An account the sheet offers. */
export type FindAccount = { id: string; name: string; whose: Whose };

/** What the sheet offers, which also names what's picked. */
export type FindLists = {
  accounts: readonly FindAccount[];
  categories: readonly CategoryChoice[];
  tags: readonly TagRef[];
};

export const RANGE_LABELS: Record<DateRange, string> = {
  month: "This month",
  last: "Last month",
  "3m": "Last 3 months",
  custom: "Custom",
};

// The address ------------------------------------------------------------------------------------

const intOf = (text: string | undefined) => (text && /^\d+$/.test(text) ? Number(text) : null);

/** Filters from the address, read with `get` (such as a search param's first value). */
export function findFromParams(get: (key: string) => string | undefined): Find {
  const list = (key: string) => get(key)?.split(",").filter(Boolean) ?? [];
  const accounts = list("acct");
  return cleanFind({
    mine: get("mine") === "1",
    accounts: accounts.length > 0 ? accounts : null,
    categories: list("cat"),
    tags: list("tag"),
    range: get("when"),
    from: get("from"),
    to: get("to"),
    min: intOf(get("min")),
    max: intOf(get("max")),
    direction: get("dir"),
    transfers: get("transfers") !== "no",
    pending: get("pending") !== "no",
  });
}

/** The filters as address params, in a fixed order, so the same filters give the same address. */
export function findEntries(find: Find): [string, string][] {
  const entries: [string, string][] = [];
  const ids = (key: string, list: readonly string[] | null) => {
    if (list && list.length > 0) entries.push([key, [...list].sort().join(",")]);
  };
  if (find.mine) entries.push(["mine", "1"]);
  ids("acct", find.accounts);
  ids("cat", find.categories);
  ids("tag", find.tags);
  if (find.range) entries.push(["when", find.range]);
  if (find.range === "custom") {
    if (find.from) entries.push(["from", find.from]);
    if (find.to) entries.push(["to", find.to]);
  }
  if (find.min !== null) entries.push(["min", String(find.min)]);
  if (find.max !== null) entries.push(["max", String(find.max)]);
  if (find.direction !== "both") entries.push(["dir", find.direction]);
  if (!find.transfers) entries.push(["transfers", "no"]);
  if (!find.pending) entries.push(["pending", "no"]);
  return entries;
}

/** True when nothing is filtered. */
export const isAnything = (find: Find) => findEntries(find).length === 0;

/** One string for a search and its filters, to tell whether two are the same. */
export const filtersKey = ({ search, find }: SavedFilters) =>
  new URLSearchParams([...(search ? [["q", search]] : []), ...findEntries(find)]).toString();

// Words ------------------------------------------------------------------------------------------

const dollars = (cents: number) => formatMoney(cents, { decimals: "auto", sign: "never" });

/** "1 to 10 Oct", "11 Jul to 10 Oct" or "1 Dec 2025 to 10 Oct 2026". */
export function daysText(from: PlainDate, to: PlainDate): string {
  const a = parts(from);
  const b = parts(to);
  if (from === to) return formatShortDate(from, { weekday: false });
  if (a.year !== b.year)
    return `${formatShortDate(from, { weekday: false, year: true })} to ${formatShortDate(to, { weekday: false, year: true })}`;
  const start = a.month === b.month ? String(a.day) : formatShortDate(from, { weekday: false });
  return `${start} to ${formatShortDate(to, { weekday: false })}`;
}

/** The days a range covers in words, such as "1 to 10 Oct", or "Any time". */
export function rangeText(find: Pick<Find, "range" | "from" | "to">, today: PlainDate): string {
  if (!find.range) return "Any time";
  const { from, to } = rangeDays(find, today);
  if (from && to) return daysText(from, to);
  if (find.range !== "custom" && from) return daysText(from, today);
  if (from) return `From ${formatShortDate(from, { weekday: false })}`;
  if (to) return `Up to ${formatShortDate(to, { weekday: false })}`;
  return "Pick the days";
}

/** "$50 to $120", "$50 or more" or "Up to $120". */
export function amountText(find: Pick<Find, "min" | "max">): string | null {
  if (find.min !== null && find.max !== null)
    return find.min === find.max
      ? dollars(find.min)
      : `${dollars(find.min)} to ${dollars(find.max)}`;
  if (find.min !== null) return `${dollars(find.min)} or more`;
  if (find.max !== null) return `Up to ${dollars(find.max)}`;
  return null;
}

export type FilterChip = {
  key: string;
  label: string;
  /** A category's colour, shown as a key. */
  colour?: DataColour;
  /** The filters without this one. */
  without: Find;
};

/** The filters in use, one chip each, in the sheet's order. */
export function findChips(find: Find, lists: FindLists, today: PlainDate): FilterChip[] {
  const chips: FilterChip[] = [];
  const add = (key: string, label: string, without: Partial<Find>, colour?: DataColour) =>
    chips.push({ key, label, colour, without: { ...find, ...without } });
  if (find.mine) add("mine", "Mine", { mine: false });
  if (find.accounts) {
    const picked = lists.accounts.filter((a) => find.accounts!.includes(a.id));
    add(
      "accounts",
      picked.length === 1
        ? `${picked[0].name} only`
        : `${picked.length} of ${lists.accounts.length} accounts`,
      { accounts: null },
    );
  }
  for (const category of lists.categories)
    if (find.categories.includes(category.id))
      add(
        `cat-${category.id}`,
        category.name,
        { categories: find.categories.filter((id) => id !== category.id) },
        categoryColour(category),
      );
  for (const tag of lists.tags)
    if (find.tags.includes(tag.id))
      add(`tag-${tag.id}`, tag.name, { tags: find.tags.filter((id) => id !== tag.id) });
  if (find.range)
    add("range", find.range === "custom" ? rangeText(find, today) : RANGE_LABELS[find.range], {
      range: null,
      from: null,
      to: null,
    });
  const amount = amountText(find);
  if (amount) add("amount", amount, { min: null, max: null });
  if (find.direction !== "both")
    add("direction", find.direction === "in" ? "Money in" : "Money out", { direction: "both" });
  if (!find.transfers) add("transfers", "No transfers", { transfers: true });
  if (!find.pending) add("pending", "No pending", { pending: true });
  return chips;
}

/**
 * A name for a saved view from what's picked, as the board does: "Mine, Groceries, this month",
 * "Bali 2027" or "3 categories, Money out, 1 to 30 Sep". The person can change it.
 */
export function viewName(filters: SavedFilters, lists: FindLists, today: PlainDate): string {
  const { find, search } = filters;
  const bits: string[] = [];
  if (search) bits.push(`“${search}”`);
  if (find.mine) bits.push("Mine");
  const categories = lists.categories.filter((c) => find.categories.includes(c.id));
  if (categories.length > 0)
    bits.push(categories.length === 1 ? categories[0].name : `${categories.length} categories`);
  const tags = lists.tags.filter((t) => find.tags.includes(t.id));
  if (tags.length > 0) bits.push(tags.length === 1 ? tags[0].name : `${tags.length} tags`);
  const amount = amountText(find);
  if (amount) bits.push(amount);
  if (find.direction !== "both") bits.push(find.direction === "in" ? "Money in" : "Money out");
  // A view keeps rolling with today, so only a custom range is named by its days.
  if (find.range === "custom") bits.push(rangeText(find, today));
  else if (find.range) bits.push(RANGE_LABELS[find.range].toLowerCase());
  if (bits.length === 0 && find.accounts) {
    const picked = lists.accounts.filter((a) => find.accounts!.includes(a.id));
    bits.push(picked.length === 1 ? picked[0].name : `${picked.length} accounts`);
  }
  if (bits.length === 0 && !find.transfers) bits.push("No transfers");
  if (bits.length === 0 && !find.pending) bits.push("Settled");
  // Whole bits that fit, and only the first one cut short when even that is too long.
  let name = bits[0] ?? "My view";
  for (const bit of bits.slice(1)) {
    if (name.length + 2 + bit.length > VIEW_NAME_MAX) break;
    name = `${name}, ${bit}`;
  }
  const capital = name.charAt(0).toUpperCase() + name.slice(1);
  return capital.length > VIEW_NAME_MAX ? `${capital.slice(0, VIEW_NAME_MAX - 1)}…` : capital;
}
