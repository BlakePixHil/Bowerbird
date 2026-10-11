import type { ActivityFilters, View } from "@/lib/access";

/** Activity's quick chips. The full filter sheet is BUD-29. */
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

export function filtersOf(show: Show, search: string): ActivityFilters {
  return { search: search || undefined, toCheck: show === "check" };
}

/** Searches longer than this are cut short. */
export const MAX_SEARCH = 100;

/** The words from `?q=`, trimmed. */
export function parseSearch(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_SEARCH) : "";
}

/** Activity's address for a chip and a search. */
export function activityHref(show: Show, search: string): string {
  const params = new URLSearchParams();
  if (show !== "all") params.set("show", show);
  if (search) params.set("q", search);
  const query = params.toString();
  return query ? `/activity?${query}` : "/activity";
}
