"use server";

import {
  activityPage,
  countActivity,
  removeView,
  saveView,
  viewerOf,
  type ActivityPage,
  type ViewSaved,
} from "@/lib/access";
import { cleanFind } from "@/lib/access/find";
import { requireMember } from "@/lib/auth";
import {
  applyFromAction,
  ids,
  muddled,
  type CategoryChange,
  type ChangeKind,
  type ChangeOf,
  type NoteChange,
  type ShopRuleChange,
  type SplitChange,
  type TagChange,
  type TransferChange,
  type UnsplitChange,
} from "@/lib/changes";
import { getDb } from "@/lib/db";
import { isPlainDate, todayIn } from "@/lib/money";
import { filtersOf, parseSearch, parseShow, viewOf } from "./show";

/** What Activity is showing: a chip, a search and the filters. */
export type Finding = { show: string; search: string; find: unknown };

async function finding({ show, search, find }: Finding) {
  const me = await requireMember();
  const chip = parseShow(show);
  return {
    viewer: viewerOf(me),
    view: viewOf(chip),
    filters: filtersOf(chip, parseSearch(search), cleanFind(find), todayIn(me.household.timezone)),
  };
}

/** The next page of Activity: the whole days before `before`, for the same chip and filters. */
export async function moreActivity(showing: Finding, before: string): Promise<ActivityPage> {
  const { viewer, view, filters } = await finding(showing);
  if (!isPlainDate(before)) return { rows: [], next: null };
  return activityPage(getDb(), viewer, view, filters, before);
}

/** How many rows the filter sheet's choices match, for "Show 37 transactions". */
export async function countFound(showing: Finding): Promise<number> {
  const { viewer, view, filters } = await finding(showing);
  return countActivity(getDb(), viewer, view, filters);
}

/** Saves the sheet's search and filters as a view called `name`. */
export async function saveFilters(view: {
  name: string;
  search: string;
  find: unknown;
}): Promise<ViewSaved> {
  const viewer = viewerOf(await requireMember());
  if (typeof view.name !== "string" || typeof view.search !== "string") return muddled;
  return saveView(getDb(), viewer, view.name.slice(0, 200), {
    search: parseSearch(view.search),
    find: cleanFind(view.find),
  });
}

/** Removes one of the person's saved views. */
export async function forgetView(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = viewerOf(await requireMember());
  if (!ids(id)) return muddled;
  return removeView(getDb(), viewer, id);
}

/*
 * Changes to a transaction. Each carries its own `id`, made on the device, and goes through
 * `applyChange`, which saves each id once. The offline queue sends the same changes to
 * `/api/changes` when the phone is back online.
 */

const apply = async <K extends ChangeKind>(kind: K, change: ChangeOf<K>) =>
  applyFromAction(getDb(), viewerOf(await requireMember()), kind, change);

/** Puts one transaction in a category. */
export async function changeCategory(change: CategoryChange) {
  return apply("category", change);
}

/** "Yes, always": sort a shop into a category from now on, and the earlier rows too if asked. */
export async function sortShop(change: ShopRuleChange) {
  return apply("shop-rule", change);
}

/** "This is a transfer" or "Not a transfer", for one transaction and its other side. */
export async function markTransfer(change: TransferChange) {
  return apply("transfer", change);
}

/** Splits one transaction across categories, replacing any split it had. */
export async function saveSplit(change: SplitChange) {
  return apply("split", change);
}

/** Takes a split away. */
export async function unsplit(change: UnsplitChange) {
  return apply("unsplit", change);
}

/** Adds a tag by name, or takes one off by its id. */
export async function changeTags(change: TagChange) {
  return apply("tags", change);
}

/** Saves a transaction's note. An empty one takes it away. */
export async function changeNote(change: NoteChange) {
  return apply("note", change);
}
