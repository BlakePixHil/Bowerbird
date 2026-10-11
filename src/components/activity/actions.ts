"use server";

import {
  activityPage,
  addTag,
  categoriseTransaction,
  markAsTransfer,
  notATransfer,
  removeSplit,
  removeTag,
  saveNote,
  sortShopAlways,
  splitTransaction,
  viewerOf,
  type ActivityPage,
  type Categorised,
  type NoteSaved,
  type PartChoice,
  type ShopSorted,
  type SplitRemoved,
  type SplitSaved,
  type TagsSaved,
  type TransferChanged,
} from "@/lib/access";
import { SPLIT_MAX_PARTS } from "@/lib/access/limits";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isPlainDate } from "@/lib/money";
import { filtersOf, parseSearch, parseShow, viewOf } from "./show";

/** The next page of Activity: the whole days before `before`, for the same chip and search. */
export async function moreActivity(
  show: string,
  search: string,
  before: string,
): Promise<ActivityPage> {
  const viewer = viewerOf(await requireMember());
  if (!isPlainDate(before)) return { rows: [], next: null };
  const chip = parseShow(show);
  return activityPage(getDb(), viewer, viewOf(chip), filtersOf(chip, parseSearch(search)), before);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (...values: unknown[]) => values.every((v) => typeof v === "string" && UUID.test(v));
const muddled = { ok: false as const, error: "That change didn't make sense. Try again." };

/**
 * A change someone makes to their data. Each has its own `id`, made on the device, so the offline
 * queue (project 06) can hold it and send it later. Sending one twice gives the same result.
 */
export type CategoryChange = { id: string; transactionId: string; categoryId: string };

/** Puts one transaction in a category. */
export async function changeCategory(change: CategoryChange): Promise<Categorised> {
  const viewer = viewerOf(await requireMember());
  if (!ids(change.id, change.transactionId, change.categoryId)) return muddled;
  return categoriseTransaction(getDb(), viewer, change.transactionId, change.categoryId);
}

/** "Yes, always": sort a shop into a category from now on, and the earlier rows too if asked. */
export type ShopRuleChange = {
  id: string;
  merchantId: string;
  categoryId: string;
  earlier: boolean;
};

export async function sortShop(change: ShopRuleChange): Promise<ShopSorted> {
  const viewer = viewerOf(await requireMember());
  if (!ids(change.id, change.merchantId, change.categoryId)) return muddled;
  return sortShopAlways(
    getDb(),
    viewer,
    change.merchantId,
    change.categoryId,
    change.earlier === true,
  );
}

/** "This is a transfer" or "Not a transfer", for one transaction and its other side. */
export type TransferChange = { id: string; transactionId: string; transfer: boolean };

export async function markTransfer(change: TransferChange): Promise<TransferChanged> {
  const viewer = viewerOf(await requireMember());
  if (!ids(change.id, change.transactionId)) return muddled;
  return change.transfer === true
    ? markAsTransfer(getDb(), viewer, change.transactionId)
    : notATransfer(getDb(), viewer, change.transactionId);
}

/** Splits one transaction across categories, replacing any split it had. */
export type SplitChange = { id: string; transactionId: string; parts: PartChoice[] };

export async function saveSplit(change: SplitChange): Promise<SplitSaved> {
  const viewer = viewerOf(await requireMember());
  const parts = Array.isArray(change.parts) ? change.parts.slice(0, SPLIT_MAX_PARTS + 1) : [];
  if (
    !ids(change.id, change.transactionId, ...parts.map((part) => part?.categoryId)) ||
    parts.some((part) => typeof part.cents !== "number")
  )
    return muddled;
  return splitTransaction(
    getDb(),
    viewer,
    change.transactionId,
    parts.map((part) => ({ categoryId: part.categoryId, cents: part.cents })),
  );
}

/** Takes a split away. */
export type UnsplitChange = { id: string; transactionId: string };

export async function unsplit(change: UnsplitChange): Promise<SplitRemoved> {
  const viewer = viewerOf(await requireMember());
  if (!ids(change.id, change.transactionId)) return muddled;
  return removeSplit(getDb(), viewer, change.transactionId);
}

/** Adds a tag by name, or takes one off by its id. */
export type TagChange =
  | { id: string; transactionId: string; add: string }
  | { id: string; transactionId: string; remove: string };

export async function changeTags(change: TagChange): Promise<TagsSaved> {
  const viewer = viewerOf(await requireMember());
  if (!ids(change.id, change.transactionId)) return muddled;
  if ("add" in change && typeof change.add === "string")
    return addTag(getDb(), viewer, change.transactionId, change.add.slice(0, 200));
  if ("remove" in change && ids(change.remove))
    return removeTag(getDb(), viewer, change.transactionId, change.remove);
  return muddled;
}

/** Saves a transaction's note. An empty one takes it away. */
export type NoteChange = { id: string; transactionId: string; note: string };

export async function changeNote(change: NoteChange): Promise<NoteSaved> {
  const viewer = viewerOf(await requireMember());
  if (!ids(change.id, change.transactionId) || typeof change.note !== "string") return muddled;
  return saveNote(getDb(), viewer, change.transactionId, change.note.slice(0, 2000));
}
