import { readCsv } from "./csv";
import { looksLikeOfx, readOfx } from "./ofx";
import { looksLikeQif, readQif } from "./qif";
import type { ColumnRole, FileFormat, ParseResult } from "./types";

export { closingBalance, fileBalances } from "./balance";
export { missingColumns } from "./csv";
export { dedupeKey, dedupeKeys, normaliseDescription } from "./dedupe";
export { matchRows, type ExistingRow, type RowMatch } from "./match";
export { COLUMN_ROLES } from "./types";
export { parseBankAmount, parseBankDate } from "./values";
export type {
  ColumnRole,
  DetectedColumn,
  FileFormat,
  FileLayout,
  FileProblem,
  ParsedFile,
  ParsedRow,
  ParseResult,
} from "./types";

/**
 * Bigger than any bank export of a few years, and small enough to send in one request: Vercel
 * functions take at most 4.5 MB, and the upload needs a little room around the file.
 */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

export const NOT_A_BANK_FILE =
  "This file doesn't look like a bank export. Download a CSV, OFX or QIF file from your bank's website and try again.";
const EMPTY = "This file is empty. Download it from your bank again and try once more.";
export const TOO_BIG = "This file is bigger than 4 MB. Export a shorter date range and try again.";
const NO_ROWS = "We couldn't find any transactions in this file.";

/**
 * UTF-8, UTF-16 when the file starts with its byte-order mark (spreadsheet "Unicode text"), or
 * Windows-1252 for older exports that aren't valid UTF-8. The byte-order mark is dropped.
 */
function decode(bytes: Uint8Array): string {
  let text: string;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.replace(/^\uFEFF/, "");
}

/** Spreadsheets, PDFs and other files that are never a bank export, judged by their first bytes. */
function isBinary(bytes: Uint8Array): boolean {
  const start = String.fromCharCode(...bytes.slice(0, 5));
  if (start.startsWith("%PDF") || start.startsWith("PK\u0003\u0004")) return true;
  const sample = bytes.slice(0, 1024);
  return sample.some((b) => b === 0);
}

function formatFromName(filename: string): FileFormat | null {
  const extension = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase();
  if (extension === "csv" || extension === "txt") return "csv";
  if (extension === "ofx" || extension === "qfx" || extension === "qbo") return "ofx";
  if (extension === "qif") return "qif";
  return null;
}

/**
 * Turns a bank export into one list of rows ready to check and import. Reads Westpac's and ANZ's
 * CSV layouts, any other CSV from a best guess at its columns, OFX (SGML or XML, and QBO) and QIF.
 * The format comes from what's in the file, and the file name only breaks a tie. Never throws:
 * a file that can't be read comes back as `{ ok: false, error }` in plain words.
 *
 * For a CSV, pass `columns` (one role per column) to read it with the person's choice of columns
 * from the "Which column is which" sheet.
 */
export function parseBankFile(
  input: ArrayBuffer | Uint8Array | string,
  filename: string,
  options: { columns?: readonly ColumnRole[] } = {},
): ParseResult {
  try {
    const bytes =
      typeof input === "string"
        ? new TextEncoder().encode(input)
        : input instanceof Uint8Array
          ? input
          : new Uint8Array(input);
    if (bytes.length > MAX_FILE_BYTES) return { ok: false, error: TOO_BIG };
    const utf16 =
      (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
    if (!utf16 && isBinary(bytes)) return { ok: false, error: NOT_A_BANK_FILE };
    const text = decode(bytes);
    if (text.trim() === "") return { ok: false, error: EMPTY };

    const named = formatFromName(filename);
    if (looksLikeOfx(text)) {
      const file = readOfx(text);
      if (file.rows.length === 0) return { ok: false, error: NO_ROWS };
      return { ok: true, format: "ofx", ...file };
    }
    if (looksLikeQif(text)) {
      const file = readQif(text);
      if (file.rows.length === 0) return { ok: false, error: NO_ROWS };
      return { ok: true, format: "qif", ...file };
    }
    if (named === "ofx" || named === "qif") return { ok: false, error: NOT_A_BANK_FILE };

    const csv = readCsv(text, options.columns);
    if (!csv) return { ok: false, error: NOT_A_BANK_FILE };
    if (csv.layout !== "other" && csv.rows.length === 0) return { ok: false, error: NO_ROWS };
    return { ok: true, format: "csv", ...csv };
  } catch {
    return { ok: false, error: NOT_A_BANK_FILE };
  }
}
