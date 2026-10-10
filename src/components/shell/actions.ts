"use server";

import { requireMember } from "@/lib/auth";

/**
 * Syncs the household's live bank connections now, from Sync now in the header. Project 02 fills
 * this in (BUD-19): sync each connection, then refresh the page. Until then there is nothing
 * connected, so there is nothing to sync.
 */
export async function syncNow(): Promise<void> {
  await requireMember();
}
