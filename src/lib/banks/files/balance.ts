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
  const rows = file.rows.filter(
    (row): row is ParsedRow & { balanceCents: number } => row.balanceCents !== undefined,
  );
  if (rows.length === 0) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  let newestFirst = first.date > last.date;
  if (first.date === last.date && rows.length > 1) {
    // All on one day. Oldest first means each balance is the one before plus this row's amount.
    newestFirst = rows[1].balanceCents !== rows[0].balanceCents + rows[1].amountCents;
  }
  const latest = newestFirst ? first : last;
  return { date: latest.date, balanceCents: latest.balanceCents };
}
