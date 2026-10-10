import type { ParsedRow } from "./types";

/**
 * A description reduced to what stays the same between exports: upper case, card numbers and
 * reference numbers taken out, spaces collapsed. "Woolworths 1187 Card xx1234 Ref 00981234"
 * becomes "WOOLWORTHS 1187".
 */
export function normaliseDescription(description: string): string {
  return (
    description
      .toUpperCase()
      // Whole card numbers: 4111 1111 1111 1111, 4111-1111-1111-1111.
      .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,4}\b/g, " ")
      // Masked card numbers, with or without the word card: CARD XX1234, xxxx-xxxx-1234, ****1234.
      .replace(/\b(?:CARD\s*(?:NO\.?|NUMBER)?\s*)?[X*]{2,}[X*\d\s-]*\d{2,4}\b/g, " ")
      .replace(/\*{2,}[\d\s-]*\d{2,4}\b/g, " ")
      .replace(/\bCARD\s*(?:NO\.?|NUMBER)?\s*\d{4}\b/g, " ")
      // Reference and receipt numbers: REF 123456, RECEIPT NO. 98765, TXN#A1B2C3.
      .replace(
        /\b(?:REF(?:ERENCE)?|RECEIPT|RCPT|TXN|TRAN(?:SACTION)?|ID)\s*(?:NO\.?|NUMBER|#|:)?\s*[A-Z0-9-]*\d[A-Z0-9-]*/g,
        " ",
      )
      // Any other long run of digits is a reference too. Short ones, like store numbers, stay.
      .replace(/\b\d{6,}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Date, amount and normalised description. Two rows with the same key are the same transaction. */
export function dedupeKey(row: Pick<ParsedRow, "date" | "amountCents" | "description">): string {
  return `${row.date}|${row.amountCents}|${normaliseDescription(row.description)}`;
}

/**
 * The dedupe key for every row in a file. Two identical rows in one file are both real (two
 * coffees on the same morning), so the second gets `#2`, the third `#3`, and so on. Importing the
 * same file again gives the same keys, so nothing doubles up.
 */
export function dedupeKeys(
  rows: readonly Pick<ParsedRow, "date" | "amountCents" | "description">[],
) {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = dedupeKey(row);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? key : `${key}#${count}`;
  });
}
