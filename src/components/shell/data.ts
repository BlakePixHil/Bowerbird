import { connection } from "next/server";
import { cache } from "react";
import type { Owner } from "@/components/ui";
import { DEFAULT_TIMEZONE } from "@/config/app";
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

/**
 * Reads the frame's data once per request. Until sign-in (BUD-11) and the access helper (BUD-13)
 * exist there is no member or household to read, so it returns neutral placeholders. Project 02
 * fills in the sync state.
 */
export const getShell = cache(async (): Promise<Shell> => {
  // Today's date changes per request, so the frame is never prerendered at build time.
  await connection();
  const now = new Date();
  const timeZone = DEFAULT_TIMEZONE;
  return {
    householdName: "Our household",
    timeZone,
    now,
    today: todayIn(timeZone, now),
    member: { name: "You", initials: "Y", owner: "you" },
    sync: { kind: "never" },
  };
});
