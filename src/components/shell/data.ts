import { connection } from "next/server";
import { cache } from "react";
import type { Owner } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { todayIn, type PlainDate } from "@/lib/money";
import type { SyncState } from "./sync";

/** What the frame around every signed-in page needs: who's looking, where, and when. */
export type Shell = {
  householdName: string;
  timeZone: string;
  now: Date;
  today: PlainDate;
  member: { name: string; initials: string; owner: Owner };
  sync: SyncState;
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
 * in). Project 02 fills in the sync state.
 */
export const getShell = cache(async (): Promise<Shell> => {
  // Today's date changes per request, so the frame is never prerendered at build time.
  await connection();
  const me = await requireMember();
  const now = new Date();
  const timeZone = me.household.timezone;
  return {
    householdName: me.household.name,
    timeZone,
    now,
    today: todayIn(timeZone, now),
    member: {
      name: me.member.displayName,
      initials: initialsOf(me.member.displayName),
      owner: "you",
    },
    sync: { kind: "never" },
  };
});
