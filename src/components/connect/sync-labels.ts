import { count, number } from "@/components/import/labels";
import { WINDOW_DAYS, type FirstSyncProgress, type SyncAccount } from "@/lib/banks/live/shapes";
import { addDays, daysBetween, formatShortDate, parts, type PlainDate } from "@/lib/money";

/** The words and shapes on the first sync screen, worked out from where the sync is up to. */

/**
 * How far back an account's history reaches: while it's bringing in, every day it has asked for so
 * far; once it's done, its oldest row.
 */
export const reachOf = (account: SyncAccount): PlainDate | null =>
  account.status === "busy" ? (account.historyFrom ?? account.oldest) : account.oldest;

/**
 * The left end of the history chart: the furthest back any account reaches, and at least 90 days.
 * While accounts are still bringing in, it leaves room for the next stretch they'll ask for, so a
 * bar only fills once its account is done.
 */
export function axisStart(progress: FirstSyncProgress): PlainDate {
  let start = addDays(progress.today, -(WINDOW_DAYS - 1));
  for (const account of progress.accounts) {
    const reach = reachOf(account) ?? progress.today;
    const room = account.status === "done" ? reach : addDays(reach, -WINDOW_DAYS);
    if (room < start) start = room;
  }
  return start;
}

/** Where on the chart, from 0 to 100, an account's history starts. 100 means nothing yet. */
export function reachPercent(account: SyncAccount, start: PlainDate, today: PlainDate): number {
  const reach = reachOf(account);
  const span = daysBetween(start, today) + 1;
  if (!reach || span <= 0) return 100;
  return Math.min(100, Math.max(0, (daysBetween(start, reach) / span) * 100));
}

/** The oldest transaction across the accounts, or null before any come in. */
export function oldestOf(progress: FirstSyncProgress): PlainDate | null {
  const dates = progress.accounts.flatMap((account) => (account.oldest ? [account.oldest] : []));
  return dates.sort()[0] ?? null;
}

/** "Done · 214 transactions since Sat 11 Jul", "Bringing in · 248 so far" or "Waiting its turn". */
export function statusLine(account: SyncAccount): string {
  if (account.status === "done")
    return account.oldest
      ? `Done · ${count(account.rows, "transaction")} since ${formatShortDate(account.oldest)}`
      : "Done · no transactions to bring in";
  if (account.status === "busy") return `Bringing in · ${number(account.rows)} so far`;
  return "Waiting its turn";
}

/** "Back to Sun 16 Aug so far", while an account is still bringing in its history. */
export function backLine(account: SyncAccount): string | null {
  const reach = reachOf(account);
  return account.status === "busy" && reach ? `Back to ${formatShortDate(reach)} so far` : null;
}

/** The desktop's one line: "Bringing in · 248 so far, back to Sun 16 Aug". */
export function statusWithBack(account: SyncAccount): string {
  const reach = reachOf(account);
  return account.status === "busy" && reach
    ? `${statusLine(account)}, back to ${formatShortDate(reach)}`
    : statusLine(account);
}

/** The line under the title. */
export function leadLine(progress: FirstSyncProgress, place: "screen" | "page"): string {
  if (progress.finished) {
    const oldest = oldestOf(progress);
    return oldest
      ? `Everything since ${formatShortDate(oldest)} is here.`
      : "Your accounts are in. There were no transactions to bring in.";
  }
  return `Bringing in everything your banks share, newest first. You can leave this ${place}, it keeps going.`;
}

/** The pill at the top of the desktop card. */
export function pillLine(progress: FirstSyncProgress): string {
  if (progress.finished) return "All done";
  if (progress.problem) return "Stopped";
  const left = progress.accounts.length - progress.done;
  return `${left} still bringing in`;
}

/** Labels along the bottom of the history chart: its first day, each month after, and Today. */
export function chartTicks(start: PlainDate, today: PlainDate) {
  const span = daysBetween(start, today) + 1;
  const at = (date: PlainDate) => (daysBetween(start, date) / span) * 100;
  const ticks = [{ label: formatShortDate(start, { weekday: false }), x: 0, shift: 0 }];
  const first = parts(start);
  // The first of each month after the start, left out where it would crowd the ends.
  for (let i = 1; i < 30; i++) {
    const month = new Date(Date.UTC(first.year, first.month - 1 + i, 1)).toISOString().slice(0, 10);
    if (month > today) break;
    const x = at(month);
    if (x < 12 || x > 88) continue;
    ticks.push({ label: formatShortDate(month, { weekday: false }).split(" ")[1], x, shift: -50 });
  }
  ticks.push({ label: "Today", x: 100, shift: -100 });
  return ticks;
}

/** "150 days" of history so far, from the oldest transaction to today. */
export function daysBack(progress: FirstSyncProgress): number | null {
  const oldest = oldestOf(progress);
  return oldest ? daysBetween(oldest, progress.today) + 1 : null;
}
