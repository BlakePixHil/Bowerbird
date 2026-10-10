import { dedupeKey } from "./dedupe";
import type { ParsedRow } from "./types";

/** A transaction already in the account, as far as matching needs it. */
export type ExistingRow = {
  date: string;
  amountCents: number;
  descriptionRaw: string;
  externalId: string | null;
  dedupeKey: string | null;
  source: "sync" | "file";
};

/** What happens to one row of a file: imported as new, or skipped because it's already here. */
export type RowMatch =
  | { index: number; row: ParsedRow; status: "here" }
  | {
      index: number;
      row: ParsedRow;
      status: "new";
      /** The key to save, unique in the account. */
      dedupeKey: string;
      /** The bank's id to save, left out when another row already has it. */
      externalId: string | null;
    };

/**
 * Sorts a file's rows into new and already here, against the rows already in the account.
 *
 * A row is already here when an earlier file gave a row with the same bank id (OFX FITID), or
 * when the account has a row with the same date, amount and normalised description that no other
 * row of this file matched first. So two identical coffees in the file and one already here
 * imports one more, and importing the same file twice imports nothing the second time.
 *
 * Each new row gets a dedupe key no row in the account has yet: the plain key for the first row
 * like it, then `#2`, `#3` and so on, as `dedupeKeys` gives for a single file.
 */
export function matchRows(
  rows: readonly ParsedRow[],
  existing: readonly ExistingRow[],
): RowMatch[] {
  const fileIds = new Set(rows.flatMap((row) => (row.externalId ? [row.externalId] : [])));
  const importedIds = new Set<string>();
  const syncedIds = new Set<string>();
  const unmatched = new Map<string, number>();
  const total = new Map<string, number>();
  const taken = new Set<string>();

  for (const old of existing) {
    if (old.dedupeKey) taken.add(old.dedupeKey);
    if (old.externalId && fileIds.has(old.externalId)) {
      if (old.source === "file") {
        // Matched by the bank's id, so it can't also match a row by its description.
        importedIds.add(old.externalId);
        continue;
      }
      syncedIds.add(old.externalId);
    }
    const key = dedupeKey({
      date: old.date,
      amountCents: old.amountCents,
      description: old.descriptionRaw,
    });
    unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
    total.set(key, (total.get(key) ?? 0) + 1);
  }

  const usedIds = new Set<string>();
  return rows.map((row, index): RowMatch => {
    if (row.externalId && importedIds.has(row.externalId)) return { index, row, status: "here" };
    const key = dedupeKey(row);
    const left = unmatched.get(key) ?? 0;
    if (left > 0) {
      unmatched.set(key, left - 1);
      return { index, row, status: "here" };
    }
    let count = (total.get(key) ?? 0) + 1;
    let stored = count === 1 ? key : `${key}#${count}`;
    while (taken.has(stored)) {
      count += 1;
      stored = `${key}#${count}`;
    }
    total.set(key, count);
    taken.add(stored);
    // The account's bank ids must stay unique: a synced row, or an earlier row of this file, may
    // already use this one.
    let externalId = row.externalId ?? null;
    if (externalId && (syncedIds.has(externalId) || usedIds.has(externalId))) externalId = null;
    if (externalId) usedIds.add(externalId);
    return { index, row, status: "new", dedupeKey: stored, externalId };
  });
}
