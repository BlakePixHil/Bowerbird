import type { ActivityFilters, View } from "@/lib/access";
import { ANYTHING, findFilters, type Find } from "@/lib/access/find";
import type { PlainDate } from "@/lib/money";
import { findEntries } from "./find";

/** Activity's quick chips. Saved views and the filter sheet narrow the list further. */
export type Show = "all" | "mine" | "shared" | "check";

const SHOWS: readonly Show[] = ["all", "mine", "shared", "check"];

/** The chip from `?show=`, or All for anything else. */
export function parseShow(value: unknown): Show {
  return SHOWS.includes(value as Show) ? (value as Show) : "all";
}

/** The access helper's view for a chip. To check looks across everything. */
export function viewOf(show: Show): View {
  return show === "mine" || show === "shared" ? show : "household";
}

/** The access helper's filters for a chip, a search and the filters, from the household's today. */
export function filtersOf(
  show: Show,
  search: string,
  find: Find,
  today: PlainDate,
): ActivityFilters {
  return { ...findFilters(find, today), search: search || undefined, toCheck: show === "check" };
}

/** Searches longer than this are cut short. */
export const MAX_SEARCH = 100;

/** The words from `?q=`, trimmed. */
export function parseSearch(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_SEARCH) : "";
}

/** Activity's address for a chip, a search and the filters. */
export function activityHref(show: Show, search: string, find: Find = ANYTHING): string {
  const params = new URLSearchParams();
  if (show !== "all") params.set("show", show);
  if (search) params.set("q", search);
  for (const [key, value] of findEntries(find)) params.set(key, value);
  const query = params.toString();
  return query ? `/activity?${query}` : "/activity";
}
