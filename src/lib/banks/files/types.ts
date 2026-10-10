import type { PlainDate } from "@/lib/money";

/** The file formats the app reads. Matches the `file_format` enum in the database. */
export type FileFormat = "csv" | "ofx" | "qif";

/**
 * How the file was read. "westpac" and "anz" are those banks' own CSV layouts, recognised
 * without asking. "other" is any other CSV, read from a best guess the person should check.
 * These ids are for code only. Never show a bank's name from here on screen.
 */
export type FileLayout = "westpac" | "anz" | "other" | "ofx" | "qif";

/** One transaction read from a file. */
export type ParsedRow = {
  /** The bank's date, as a plain date. */
  date: PlainDate;
  /** Signed cents. Negative is money out. */
  amountCents: number;
  /** The bank's description, as written. */
  description: string;
  /** The account's balance after this row, when the file gives one. */
  balanceCents?: number;
  /** The bank's own id for the row (OFX FITID), when the file gives one. */
  externalId?: string;
};

/** What a CSV column can hold. */
export const COLUMN_ROLES = [
  "date",
  "description",
  "amount",
  "debit",
  "credit",
  "balance",
  "ignore",
] as const;
export type ColumnRole = (typeof COLUMN_ROLES)[number];

/** One column (or OFX/QIF field) as the app understood it, for the "Which column is which" sheet. */
export type DetectedColumn = {
  /** The column's heading, or null when the file has no header row. */
  heading: string | null;
  /** The first row's value in this column, which may be empty. */
  sample: string;
  role: ColumnRole;
};

export type ParsedFile = {
  ok: true;
  format: FileFormat;
  layout: FileLayout;
  /** True when the columns are a guess the person should check before importing. */
  needsCheck: boolean;
  columns: DetectedColumn[];
  rows: ParsedRow[];
  /** Plain-words notes for the person, such as rows that couldn't be read. */
  warnings: string[];
  /** The account's balance at the end of the file, when the file states it (OFX). */
  closingBalance?: { date: PlainDate; balanceCents: number };
};

/** A file that can't be read, with a plain-words message for the person. */
export type FileProblem = { ok: false; error: string };

export type ParseResult = ParsedFile | FileProblem;
