/**
 * What the import screens send and get back. Nothing here touches the database, so the browser
 * can use it too.
 */
import type { ColumnRole, DetectedColumn, FileFormat } from "@/lib/banks/files";
import type { PlainDate } from "@/lib/money";

/** The kinds a file-only account can be. Investments, super and property are entered by hand. */
export const FILE_ACCOUNT_KINDS = [
  "everyday",
  "savings",
  "credit",
  "loan",
  "mortgage",
  "other",
] as const;
export type FileAccountKind = (typeof FILE_ACCOUNT_KINDS)[number];

/** A new account that only gets file imports. */
export type NewFileAccount = {
  name: string;
  /** The bank's name, as the person writes it. */
  institution: string | null;
  kind: FileAccountKind;
  isJoint: boolean;
};

export const ACCOUNT_NAME_MAX = 60;

/** Where the rows go: an account the person can import into, or a new file-only account. */
export type ImportTarget = { accountId: string } | { newAccount: NewFileAccount };

export type ImportRequest = {
  target: ImportTarget;
  filename: string;
  bytes: Uint8Array;
  /** The person's choice of what each CSV column holds, from "Which column is which". */
  columns?: readonly ColumnRole[];
};

export type ShownCategory = {
  name: string;
  kind: "spending" | "income" | "transfer";
  /** Icon name from the inline icon set. */
  icon: string | null;
  /** 1 to 7 maps to --c1 to --c7. Null is the shared grey. */
  colourSlot: number | null;
};

/** One row of the file as the check shows it. */
export type PreviewRow = {
  date: PlainDate;
  amountCents: number;
  /** The bank's text, as written. */
  description: string;
  /** The shop's name, once shop names are cleaned up. */
  name: string | null;
  /** The category it would get. Null means it's left to check. */
  category: ShownCategory | null;
  status: "new" | "here" | "transfer";
};

/** How many new rows would get one category. */
export type SortGroup =
  | { kind: "category"; category: ShownCategory; rows: number }
  | { kind: "rest"; rows: number }
  | { kind: "check"; rows: number };

export type ImportProblem = { ok: false; error: string };

/** "Check before importing": what the file holds and what importing it would do. */
export type ImportCheck = {
  ok: true;
  file: { name: string; size: number; format: FileFormat };
  /** The account's name, for "Into Everyday". Empty while a new account has no name yet. */
  accountName: string;
  /** True when the file looks like it came from a different bank than the account. */
  mismatch: boolean;
  /** The columns as read, one per CSV column (or OFX and QIF field). */
  columns: DetectedColumn[];
  /** CSVs can have their columns changed. OFX and QIF are standard, so they can't. */
  canChangeColumns: boolean;
  /** True when the columns are a guess the person should look at. */
  needsCheck: boolean;
  /** Why it can't be imported as the columns stand, such as a missing date column. */
  problem: string | null;
  /** Notes, such as rows that couldn't be read. */
  warnings: string[];
  rows: number;
  from: PlainDate | null;
  to: PlainDate | null;
  fresh: number;
  here: number;
  transfers: number;
  sorted: number;
  toCheck: number;
  /** New rows by the category each would get, biggest first, to-check last. */
  sorts: SortGroup[];
  /** The first rows of the file, in date order. */
  preview: PreviewRow[];
  /** The first new rows, in date order. */
  firstNew: PreviewRow[];
  /** The first rows already here, in date order. */
  firstHere: PreviewRow[];
  /** The balance the file ends on, saved with the import. */
  balance: { date: PlainDate; balanceCents: number } | null;
};

/** What an import did. */
export type ImportDone = {
  ok: true;
  importId: string;
  accountId: string;
  accountName: string;
  filename: string;
  rows: number;
  imported: number;
  skipped: number;
  from: PlainDate | null;
  to: PlainDate | null;
  sorted: number;
  toCheck: number;
  transfers: number;
};

/** One line of "Recent imports". */
export type RecentImport = {
  id: string;
  filename: string;
  accountName: string;
  createdAt: Date;
  rows: number;
  imported: number;
  skipped: number;
};
