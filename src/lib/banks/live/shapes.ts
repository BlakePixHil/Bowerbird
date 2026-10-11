import type { accounts } from "@/lib/db/schema";
import type { PlainDate } from "@/lib/money";

/** What the live sync screens send and get back. Safe to import in the browser. */

/** Days of history the first sync asks for in one request. */
export const WINDOW_DAYS = 90;
/** The furthest back the first sync goes. */
export const MAX_HISTORY_DAYS = 730;

export type AccountKind = (typeof accounts.$inferSelect)["kind"];

export type Visibility = "shared" | "balance_only" | "private";
export const VISIBILITIES: readonly Visibility[] = ["shared", "balance_only", "private"];

/** Joint accounts start Shared and the person's own start Private. */
export const startingVisibility = (isJoint: boolean): Visibility =>
  isJoint ? "shared" : "private";

/** An account the connection can read, with what the person chose for it before, if anything. */
export type LiveAccount = {
  externalId: string;
  name: string;
  /** The bank's name from the person's own data, or null. */
  institution: string | null;
  balanceCents: number;
  kind: AccountKind;
  isJoint: boolean;
  visibility: Visibility;
  /** Ticked to come in. New accounts start ticked. */
  included: boolean;
  /** Picked before, so these choices are the saved ones rather than guesses. */
  saved: boolean;
};

export type LiveAccountList =
  | { ok: true; accounts: LiveAccount[]; bankCount: number | null }
  | { ok: false; reconnect: boolean; error: string };

/** One account's choices, as the pick screen sends them. */
export type AccountPick = {
  externalId: string;
  include: boolean;
  isJoint: boolean;
  visibility: Visibility;
};

export type SavePicksResult = { ok: true; picked: number } | { ok: false; error: string };

export type SyncAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  isJoint: boolean;
  /** Waiting to start, bringing in history, or done. */
  status: "waiting" | "busy" | "done";
  /** Transactions brought in so far. */
  rows: number;
  /** The oldest transaction brought in so far, or null. */
  oldest: PlainDate | null;
  /** The earliest day asked for so far, or null before it starts. */
  historyFrom: PlainDate | null;
};

export type FirstSyncProgress = {
  connectionId: string;
  /** The ticked accounts, in the order they were picked. */
  accounts: SyncAccount[];
  /** Transactions brought in so far, across the accounts. */
  rows: number;
  /** Accounts whose history is all in. */
  done: number;
  /** Every account's history is in, and the balances are saved. */
  finished: boolean;
  /** A sync is working on it right now. */
  running: boolean;
  /** Why it stopped, in plain words, when the connection needs attention. */
  problem: { reconnect: boolean; message: string } | null;
  /** How many bank connections the provider has behind the link, when it says. */
  bankCount: number | null;
  /** Today in the household's time zone. */
  today: PlainDate;
};
