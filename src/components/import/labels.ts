import type { DataColour, IconName } from "@/components/ui";
import { ICONS } from "@/components/ui/icons";
import type { ColumnRole, DetectedColumn, FileFormat } from "@/lib/banks/files";
import type { FileAccountKind, ShownCategory } from "@/lib/banks/imports/shapes";
import { formatShortDate, type PlainDate } from "@/lib/money";

type AccountKind = FileAccountKind | "investment" | "crypto" | "super" | "property";

export const KIND_LABEL: Record<AccountKind, string> = {
  everyday: "Everyday",
  savings: "Savings",
  credit: "Credit card",
  loan: "Loan",
  mortgage: "Home loan",
  other: "Something else",
  investment: "Investments",
  crypto: "Crypto",
  super: "Super",
  property: "Property",
};

/** The icon for an account on the list, as on Accounts and sharing. */
export function accountIcon(account: { kind: string; isJoint: boolean }): IconName {
  if (account.kind === "savings") return "piggy";
  if (account.kind === "credit") return "card";
  if (account.kind === "mortgage" || account.kind === "property") return "home";
  if (account.kind === "investment" || account.kind === "super") return "trend";
  return account.isJoint ? "users" : "bank";
}

/** "Yours · Westpac" or "Joint · ANZ", from the person's own words for their bank. */
export function accountMeta(account: { isJoint: boolean; institution: string | null }): string {
  return [account.isJoint ? "Joint" : "Yours", account.institution].filter(Boolean).join(" · ");
}

export const ROLE_LABEL: Record<ColumnRole, string> = {
  date: "Date",
  description: "Description",
  amount: "Amount",
  debit: "Debit",
  credit: "Credit",
  balance: "Balance",
  ignore: "Not used",
};

export const FORMAT_LABEL: Record<FileFormat, string> = { csv: "CSV", ofx: "OFX", qif: "QIF" };

/** What the file's columns were read as, once each, in the file's order: "Date, Description…". */
export function understood(columns: readonly DetectedColumn[]): string[] {
  const roles = columns.map((column) => column.role).filter((role) => role !== "ignore");
  return [...new Set(roles)].map((role) => ROLE_LABEL[role]);
}

/** A column's name for the sheet: its heading, or its place when the file has no header row. */
export function columnName(column: DetectedColumn, index: number): string {
  return column.heading?.trim() || `Column ${index + 1}`;
}

/**
 * A column's first value for the sheet. An account or card number is masked, "•••• ••••", so it
 * isn't shown on screen. Blank values say so.
 */
export function shownSample(sample: string): string {
  const value = sample.trim();
  if (!value) return "(blank)";
  const digits = value.replace(/\D/g, "").length;
  return /^[\d\s-]+$/.test(value) && digits >= 6 ? "•••• ••••" : value;
}

/** "Not used: Bank Account, Categories and Serial." Null when every column is used. */
export function notUsed(columns: readonly DetectedColumn[]): string | null {
  const names = columns.flatMap((column, i) =>
    column.role === "ignore" ? [columnName(column, i)] : [],
  );
  if (names.length === 0) return null;
  return `Not used: ${listWords(names)}.`;
}

/** "a", "a and b", "a, b and c". */
export function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** 18 KB, or 1.2 MB. */
export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

/** "Tue 1 Sep to Wed 30 Sep 2026", or one date when the file covers a single day. */
export function dateRange(from: PlainDate | null, to: PlainDate | null): string | null {
  if (!from || !to) return null;
  if (from === to) return formatShortDate(from, { year: true });
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${formatShortDate(from, { year: !sameYear })} to ${formatShortDate(to, { year: true })}`;
}

/** "1 Sep to 30 Sep" for a tight space: no days of the week, and the year only across two years. */
export function shortRange(from: PlainDate | null, to: PlainDate | null): string | null {
  if (!from || !to) return null;
  const year = from.slice(0, 4) !== to.slice(0, 4);
  const day = (date: PlainDate) => formatShortDate(date, { year, weekday: false });
  return from === to ? day(from) : `${day(from)} to ${day(to)}`;
}

/** 1, 1 row; 214, 214 rows. Numbers over 999 get commas. */
export function count(n: number, noun: string, plural = `${noun}s`): string {
  return `${n.toLocaleString("en-AU")} ${n === 1 ? noun : plural}`;
}

export const number = (n: number) => n.toLocaleString("en-AU");

/** The colour a category is drawn in: its fixed slot, or the shared grey. */
export function categoryColour(category: Pick<ShownCategory, "colourSlot">): DataColour {
  const slot = category.colourSlot;
  return slot && slot >= 1 && slot <= 7 ? (`c${slot}` as DataColour) : "c-other";
}

export function categoryIcon(category: ShownCategory | null, transfer: boolean): IconName {
  if (transfer) return "transfer";
  if (!category) return "help";
  return category.icon && category.icon in ICONS ? (category.icon as IconName) : "tag";
}
