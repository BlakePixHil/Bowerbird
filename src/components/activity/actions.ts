"use server";

import {
  activityPage,
  categoriseTransaction,
  markAsTransfer,
  notATransfer,
  sortShopAlways,
  viewerOf,
  type ActivityPage,
  type Categorised,
  type ShopSorted,
  type TransferChanged,
} from "@/lib/access";
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
