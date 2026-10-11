import { connection } from "next/server";
import { cache } from "react";
import type { Owner } from "@/components/ui";
import { viewerOf } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { liveHealth, type ConnectionHealth } from "@/lib/banks/live/banks";
import { liveSyncSummary, resumeFirstSyncs } from "@/lib/banks/live/background";
import { getDb } from "@/lib/db";
import { todayIn, type PlainDate } from "@/lib/money";
import type { SyncState } from "./sync";

/** What the frame around every signed-in page needs: who's looking, where, and when. */
export type Shell = {
  householdName: string;
  timeZone: string;
  now: Date;
  today: PlainDate;
  member: { id: string; name: string; initials: string; owner: Owner };
  sync: SyncState;
  /** When the last sync finished, even while another runs. Offline, the page shows this. */
  lastSyncedAt: Date | null;
  /** The last sync started over an hour ago, so the page starts one once it's open. */
  syncDue: boolean;
  /** The household's live sync connections, and with just one, the banks behind it when known. */
  live: { connections: number; banks: number | null };
  /** The person has opened the installed app on some device, so install prompts stay away. */
  installed: boolean;
};

/** "Blake" is B, "Mary Jane" is MJ. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? [words[0][0]] : [words[0][0], words[words.length - 1][0]];
  return letters.join("").toUpperCase();
}

/**
 * Reads the frame's data once per request, for the signed-in member (anyone else is sent to sign
 * in). A first sync that stopped part way carries on in the background as the page loads, and a
 * sync that's due starts from the page once it's open (SyncOnOpen).
 */
export const getShell = cache(async (): Promise<Shell> => {
  // Today's date changes per request, so the frame is never prerendered at build time.
  await connection();
  const me = await requireMember();
  const now = new Date();
  const timeZone = me.household.timezone;
  const db = getDb();
  const viewer = viewerOf(me);
  const resumed = await resumeFirstSyncs(db, viewer);
  const live = await liveSyncSummary(db, viewer, now);
  return {
    householdName: me.household.name,
    timeZone,
    now,
    today: todayIn(timeZone, now),
    member: {
      id: me.member.id,
      name: me.member.displayName,
      initials: initialsOf(me.member.displayName),
      owner: "you",
    },
    sync:
      resumed || live.running || live.due
        ? { kind: "syncing" }
        : live.lastSyncedAt
          ? { kind: "synced", at: live.lastSyncedAt }
          : { kind: "never" },
    lastSyncedAt: live.lastSyncedAt,
    syncDue: live.due && !live.running,
    live: { connections: live.connections, banks: live.banks },
    installed: me.member.installedAt !== null,
  };
});

/**
 * The household's live sync connections and each bank behind them, read once per request for the
 * warning banner and the Live bank sync card.
 */
export const getLiveHealth = cache(async (): Promise<ConnectionHealth[]> => {
  const me = await requireMember();
  return liveHealth(getDb(), viewerOf(me));
});
