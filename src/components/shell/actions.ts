"use server";

import { refresh } from "next/cache";
import { viewerOf } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { syncDue, syncHousehold } from "@/lib/banks/live";
import { getDb } from "@/lib/db";

// On your own computer a pretend SimpleFIN server can run on localhost; never on Vercel.
const options = () => ({ allowLocal: process.env.NODE_ENV === "development" });

/**
 * Sync now, from the header and Accounts and sharing: syncs every live sync connection in the
 * household, whoever connected it, then refreshes the page. A problem shows on the connection.
 */
export async function syncNow(): Promise<void> {
  const viewer = viewerOf(await requireMember());
  await syncHousehold(getDb(), viewer, options());
  refresh();
}

/**
 * Sync on open: once a signed-in page is showing, syncs the household's connections whose last
 * sync started over an hour ago, then refreshes the page so the header says when.
 */
export async function syncWhenDue(): Promise<void> {
  const viewer = viewerOf(await requireMember());
  await syncDue(getDb(), viewer, options());
  refresh();
}
