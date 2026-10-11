"use server";

import {
  addCategory,
  changeRule,
  deleteCategory,
  deleteRule,
  editCategory,
  mergeCategory,
  viewerOf,
  type CategoryChanged,
  type RuleChanged,
} from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { renameShop, type RenameShop } from "@/lib/sorting/merchants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (...values: unknown[]) => values.every((v) => typeof v === "string" && UUID.test(v));
const muddled = { ok: false as const, error: "That change didn't make sense. Try again." };

/*
 * Changes on Categories and rules. Each carries its own `id`, made on the device, like the changes
 * on Activity, so the offline queue (project 06) can hold them. Sending one twice is safe, except
 * that adding a category twice is refused the second time by its name.
 */

export async function newCategory(change: { id: string; name: string }): Promise<CategoryChanged> {
  const viewer = viewerOf(await requireMember());
  if (!ids(change.id) || typeof change.name !== "string") return muddled;
  return addCategory(getDb(), viewer, change.name);
}

export async function saveCategory(change: {
  id: string;
  categoryId: string;
  name: string;
  countsTowardBudgets: boolean;
}): Promise<CategoryChanged> {
  const viewer = viewerOf(await requireMember());
  if (!ids(change.id, change.categoryId) || typeof change.name !== "string") return muddled;
  return editCategory(getDb(), viewer, change.categoryId, {
    name: change.name,
    countsTowardBudgets: change.countsTowardBudgets === true,
  });
}

export async function mergeInto(change: {
  id: string;
  categoryId: string;
  intoId: string;
}): Promise<CategoryChanged> {
  const viewer = viewerOf(await requireMember());
  if (!ids(change.id, change.categoryId, change.intoId)) return muddled;
  return mergeCategory(getDb(), viewer, change.categoryId, change.intoId);
}

export async function removeCategory(change: {
  id: string;
  categoryId: string;
}): Promise<CategoryChanged> {
  const viewer = viewerOf(await requireMember());
  if (!ids(change.id, change.categoryId)) return muddled;
  return deleteCategory(getDb(), viewer, change.categoryId);
}

export async function updateRule(change: {
  id: string;
  ruleId: string;
  enabled?: boolean;
  categoryId?: string;
  /** The tag it adds, by name, or "" for none. */
  tag?: string;
}): Promise<RuleChanged> {
  const viewer = viewerOf(await requireMember());
  if (!ids(change.id, change.ruleId) || (change.categoryId && !ids(change.categoryId)))
    return muddled;
  return changeRule(getDb(), viewer, change.ruleId, {
    enabled: typeof change.enabled === "boolean" ? change.enabled : undefined,
    categoryId: change.categoryId,
    tag: typeof change.tag === "string" ? change.tag.slice(0, 200) : undefined,
  });
}

export async function removeRule(change: { id: string; ruleId: string }): Promise<RuleChanged> {
  const viewer = viewerOf(await requireMember());
  if (!ids(change.id, change.ruleId)) return muddled;
  return deleteRule(getDb(), viewer, change.ruleId);
}

export async function nameShop(change: {
  id: string;
  merchantId: string;
  name: string;
}): Promise<RenameShop> {
  const viewer = viewerOf(await requireMember());
  if (!ids(change.id, change.merchantId) || typeof change.name !== "string") return muddled;
  return renameShop(getDb(), viewer, change.merchantId, change.name);
}
