import {
  addTag,
  categoriseTransaction,
  changeRule,
  deleteRule,
  markAsTransfer,
  notATransfer,
  removeSplit,
  removeTag,
  saveNote,
  sortShopAlways,
  splitTransaction,
  type Categorised,
  type NoteSaved,
  type PartChoice,
  type RuleChanged,
  type ShopSorted,
  type SplitRemoved,
  type SplitSaved,
  type TagsSaved,
  type TransferChanged,
  type Viewer,
} from "@/lib/access";
import { SPLIT_MAX_PARTS } from "@/lib/access/limits";
import type { Db } from "@/lib/db";
import { once, type AlreadySaved } from "./once";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ids = (...values: unknown[]) =>
  values.every((v) => typeof v === "string" && UUID.test(v));
export const muddled = { ok: false as const, error: "That change didn't make sense. Try again." };

/*
 * A change someone makes to their data. Each has its own `id`, made on the device, so the offline
 * queue can hold it and send it later, and the server saves each id once (`once`). These are the
 * changes the queue can hold: a category, a shop rule, a transfer fix, a split, tags and a note.
 */

/** Puts one transaction in a category. */
export type CategoryChange = { id: string; transactionId: string; categoryId: string };

/** "Yes, always": sort a shop into a category from now on, and the earlier rows too if asked. */
export type ShopRuleChange = {
  id: string;
  merchantId: string;
  categoryId: string;
  earlier: boolean;
};

/** "This is a transfer" or "Not a transfer", for one transaction and its other side. */
export type TransferChange = { id: string; transactionId: string; transfer: boolean };

/** Splits one transaction across categories, replacing any split it had. */
export type SplitChange = { id: string; transactionId: string; parts: PartChoice[] };

/** Takes a split away. */
export type UnsplitChange = { id: string; transactionId: string };

/** Adds a tag by name, or takes one off by its id. */
export type TagChange =
  | { id: string; transactionId: string; add: string }
  | { id: string; transactionId: string; remove: string };

/** Saves a transaction's note. An empty one takes it away. */
export type NoteChange = { id: string; transactionId: string; note: string };

/** Turns a rule on or off, or changes where it puts things and the tag it adds ("" for none). */
export type RuleChange = {
  id: string;
  ruleId: string;
  enabled?: boolean;
  categoryId?: string;
  tag?: string;
};

/** Deletes a rule. What it sorted stays sorted. */
export type RuleRemoval = { id: string; ruleId: string };

/** Each kind of change, checked and then made. Every one may come from a stranger, so it checks. */
const CHANGES = {
  category: (db: Db, viewer: Viewer, change: CategoryChange): Promise<Categorised> =>
    ids(change.transactionId, change.categoryId)
      ? categoriseTransaction(db, viewer, change.transactionId, change.categoryId)
      : Promise.resolve(muddled),

  "shop-rule": (db: Db, viewer: Viewer, change: ShopRuleChange): Promise<ShopSorted> =>
    ids(change.merchantId, change.categoryId)
      ? sortShopAlways(db, viewer, change.merchantId, change.categoryId, change.earlier === true)
      : Promise.resolve(muddled),

  transfer: (db: Db, viewer: Viewer, change: TransferChange): Promise<TransferChanged> => {
    if (!ids(change.transactionId)) return Promise.resolve(muddled);
    return change.transfer === true
      ? markAsTransfer(db, viewer, change.transactionId)
      : notATransfer(db, viewer, change.transactionId);
  },

  split: (db: Db, viewer: Viewer, change: SplitChange): Promise<SplitSaved> => {
    const parts = Array.isArray(change.parts) ? change.parts.slice(0, SPLIT_MAX_PARTS + 1) : [];
    if (
      !ids(change.transactionId, ...parts.map((part) => part?.categoryId)) ||
      parts.some((part) => typeof part.cents !== "number")
    )
      return Promise.resolve(muddled);
    return splitTransaction(
      db,
      viewer,
      change.transactionId,
      parts.map((part) => ({ categoryId: part.categoryId, cents: part.cents })),
    );
  },

  unsplit: (db: Db, viewer: Viewer, change: UnsplitChange): Promise<SplitRemoved> =>
    ids(change.transactionId)
      ? removeSplit(db, viewer, change.transactionId)
      : Promise.resolve(muddled),

  tags: (db: Db, viewer: Viewer, change: TagChange): Promise<TagsSaved> => {
    if (!ids(change.transactionId)) return Promise.resolve(muddled);
    if ("add" in change && typeof change.add === "string")
      return addTag(db, viewer, change.transactionId, change.add.slice(0, 200));
    if ("remove" in change && ids(change.remove))
      return removeTag(db, viewer, change.transactionId, change.remove);
    return Promise.resolve(muddled);
  },

  note: (db: Db, viewer: Viewer, change: NoteChange): Promise<NoteSaved> =>
    ids(change.transactionId) && typeof change.note === "string"
      ? saveNote(db, viewer, change.transactionId, change.note.slice(0, 2000))
      : Promise.resolve(muddled),

  rule: (db: Db, viewer: Viewer, change: RuleChange): Promise<RuleChanged> => {
    if (!ids(change.ruleId) || (change.categoryId && !ids(change.categoryId)))
      return Promise.resolve(muddled);
    return changeRule(db, viewer, change.ruleId, {
      enabled: typeof change.enabled === "boolean" ? change.enabled : undefined,
      categoryId: change.categoryId,
      tag: typeof change.tag === "string" ? change.tag.slice(0, 200) : undefined,
    });
  },

  "rule-removed": (db: Db, viewer: Viewer, change: RuleRemoval): Promise<RuleChanged> =>
    ids(change.ruleId) ? deleteRule(db, viewer, change.ruleId) : Promise.resolve(muddled),
};

export type ChangeKind = keyof typeof CHANGES;
export type ChangeOf<K extends ChangeKind> = Parameters<(typeof CHANGES)[K]>[2];
export type ResultOf<K extends ChangeKind> = Awaited<ReturnType<(typeof CHANGES)[K]>>;

export const CHANGE_KINDS = Object.keys(CHANGES) as ChangeKind[];

export function isChangeKind(kind: unknown): kind is ChangeKind {
  return typeof kind === "string" && Object.hasOwn(CHANGES, kind);
}

/**
 * Checks and makes one change, once: a copy of one already saved answers `already` and changes
 * nothing. Server actions and the offline queue's `/api/changes` both come through here.
 */
export async function applyChange<K extends ChangeKind>(
  db: Db,
  viewer: Viewer,
  kind: K,
  change: ChangeOf<K>,
): Promise<ResultOf<K> | AlreadySaved | typeof muddled> {
  if (typeof change !== "object" || change === null || !ids(change.id)) return muddled;
  const make = CHANGES[kind] as (
    db: Db,
    viewer: Viewer,
    change: ChangeOf<K>,
  ) => Promise<ResultOf<K>>;
  return once(db, viewer.memberId, { id: change.id, kind }, (tx) => make(tx, viewer, change));
}

/** The words for a change sent twice from a server action, which never happens on purpose. */
const SENT_TWICE = { ok: false as const, error: "That change is saved already." };

/** For server actions: the change's own answer, with "saved already" as a refusal. */
export async function applyFromAction<K extends ChangeKind>(
  db: Db,
  viewer: Viewer,
  kind: K,
  change: ChangeOf<K>,
): Promise<ResultOf<K> | typeof SENT_TWICE> {
  const result = await applyChange(db, viewer, kind, change);
  return "already" in result ? SENT_TWICE : (result as ResultOf<K>);
}
