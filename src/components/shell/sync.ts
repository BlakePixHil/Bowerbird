import { formatShortDate, todayIn } from "@/lib/money";

/** Where live sync is up to, for the header's sync slot. */
export type SyncState = { kind: "never" } | { kind: "syncing" } | { kind: "synced"; at: Date };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * The words in the header's sync slot: "Synced 12 min ago", "Synced 3 hr ago", "Synced 2 days
 * ago", then the date once it's a week old. Dates use the household's time zone.
 */
export function syncLabel(state: SyncState, now: Date, timeZone: string): string {
  if (state.kind === "never") return "Not synced yet";
  if (state.kind === "syncing") return "Syncing…";
  const ago = Math.max(0, now.getTime() - state.at.getTime());
  if (ago < MINUTE) return "Synced just now";
  if (ago < HOUR) return `Synced ${Math.floor(ago / MINUTE)} min ago`;
  if (ago < DAY) return `Synced ${Math.floor(ago / HOUR)} hr ago`;
  const days = Math.floor(ago / DAY);
  if (days < 7) return `Synced ${days} ${days === 1 ? "day" : "days"} ago`;
  return `Synced ${formatShortDate(todayIn(timeZone, state.at))}`;
}
