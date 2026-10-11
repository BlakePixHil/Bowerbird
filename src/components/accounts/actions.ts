"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { changeAccount, deleteHousehold, viewerOf, type AccountChanged } from "@/lib/access";
import { requireMember, SESSION_COOKIE } from "@/lib/auth";
import { removePasskey, type PasskeyRemoved } from "@/lib/auth/passkeys";
import { getDb } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const muddled = { ok: false as const, error: "That change didn't make sense. Try again." };

/*
 * Changes on Accounts and sharing. They need a connection, so the page turns its buttons off
 * while there's none. Sending one twice is safe: each sets a value rather than adding to one.
 */

/** Rename one of your accounts, count it toward budgets or not, or archive it or bring it back. */
export async function saveAccount(change: {
  accountId: string;
  name?: string;
  includeInBudgets?: boolean;
  archived?: boolean;
}): Promise<AccountChanged> {
  const viewer = viewerOf(await requireMember());
  if (typeof change.accountId !== "string" || !UUID.test(change.accountId)) return muddled;
  const saved = await changeAccount(getDb(), viewer, change.accountId, {
    name: change.name,
    includeInBudgets: change.includeInBudgets,
    archived: change.archived,
  });
  // Names and archiving show all over the app, so every page reads them fresh.
  if (saved.ok) revalidatePath("/", "layout");
  return saved;
}

/** Remove one of your passkeys, such as one on a phone you no longer have. Never the last one. */
export async function forgetPasskey(id: string): Promise<PasskeyRemoved> {
  const me = await requireMember();
  if (typeof id !== "string" || !UUID.test(id)) return muddled;
  const removed = await removePasskey(getDb(), me.user.id, id);
  if (removed.ok) revalidatePath("/accounts", "layout");
  return removed;
}

/**
 * Delete the household and everything in it, for good (Owner only, with its name typed). Everyone
 * is signed out, and this device goes to a goodbye page that forgets what it kept offline.
 */
export async function deleteEverything(input: { name: string }): Promise<{ error: string }> {
  const me = await requireMember();
  const deleted = await deleteHousehold(getDb(), viewerOf(me), input?.name);
  if (!deleted.ok) return { error: deleted.error };
  (await cookies()).delete(SESSION_COOKIE);
  redirect(deleted.hadLiveSync ? "/goodbye?live=1" : "/goodbye");
}
