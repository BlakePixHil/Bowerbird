import { addDays, formatClock, formatShortDate, todayIn } from "@/lib/money";

/** What a change says when it's waiting to be sent. */
export const WAITING_WORDS = "Saved on this device. It goes through once you're back online.";

/**
 * The offline banner: "Offline · showing your last sync from 9:12am", with "yesterday" or the
 * date when it wasn't today. Without live sync, it's when the page itself was kept.
 */
export function offlineLine(
  shown: { lastSync: Date | null; savedAt: Date },
  now: Date,
  timeZone: string,
): string {
  const at = shown.lastSync ?? shown.savedAt;
  const day = todayIn(timeZone, at);
  const today = todayIn(timeZone, now);
  const when =
    day === today
      ? formatClock(at, timeZone)
      : day === addDays(today, -1)
        ? `${formatClock(at, timeZone)} yesterday`
        : `${formatClock(at, timeZone)} on ${formatShortDate(day)}`;
  return shown.lastSync
    ? `Offline · showing your last sync from ${when}`
    : `Offline · showing this page from ${when}`;
}

/** "1 change to send", for the banner while changes wait. */
export function waitingLine(count: number): string {
  return count === 1 ? "1 change to send" : `${count.toLocaleString("en-AU")} changes to send`;
}
