import type { PlainDate } from "@/lib/money";
import type { ParsedFile, ParsedRow } from "./types";

/**
 * The account's balance at the end of the file: the one the file states (OFX), or else the
 * balance after the latest row, when the rows carry one (some CSVs). Files list rows oldest first
 * or newest first, so the latest row is whichever end has the latest date. Null when neither is
 * known.
 */
export function closingBalance(
  file: Pick<ParsedFile, "rows" | "closingBalance">,
): { date: PlainDate; balanceCents: number } | null {
  if (file.closingBalance) return file.closingBalance;
  return fileBalances(file).at(-1) ?? null;
}

/**
 * Every balance the file states, one per day, oldest first: when the rows carry a running balance
 * (some CSVs), the balance after each day's last row; the closing balance the file states (OFX)
 * wins for its day. Empty when the file states none.
 */
export function fileBalances(
  file: Pick<ParsedFile, "rows" | "closingBalance">,
): { date: PlainDate; balanceCents: number }[] {
  const rows = file.rows.filter(
    (row): row is ParsedRow & { balanceCents: number } => row.balanceCents !== undefined,
  );
  const byDay = new Map<PlainDate, number>();
  if (rows.length > 0) {
    const first = rows[0];
    const last = rows[rows.length - 1];
    let newestFirst = first.date > last.date;
    if (first.date === last.date && rows.length > 1) {
      // All on one day. Oldest first means each balance is the one before plus this row's amount.
      newestFirst = rows[1].balanceCents !== rows[0].balanceCents + rows[1].amountCents;
    }
    // Walk oldest to newest, so each day ends on its last row's balance.
    for (const row of newestFirst ? [...rows].reverse() : rows)
      byDay.set(row.date, row.balanceCents);
  }
  if (file.closingBalance) byDay.set(file.closingBalance.date, file.closingBalance.balanceCents);
  return [...byDay]
    .map(([date, balanceCents]) => ({ date, balanceCents }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
