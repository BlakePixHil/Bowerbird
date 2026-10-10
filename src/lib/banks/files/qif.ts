import type { DetectedColumn, ParsedFile, ParsedRow } from "./types";
import { describe } from "./ofx";
import { parseBankAmount, parseBankDate, skippedWarning } from "./values";

export function looksLikeQif(text: string): boolean {
  return /^\s*!(Type|Account|Option)/i.test(text);
}

/** QIF dates can be written 01/09/2026, 1/ 9/26 or 1/9'26. Day first, as Australian banks do. */
function qifDate(value: string) {
  return parseBankDate(value.replace(/\s+/g, "").replace("'", "/"));
}

/**
 * Reads the D (date), T (amount), P (payee) and M (memo) lines of each record. Records end with
 * `^`. Account details after `!Account` aren't transactions and are skipped.
 */
export function readQif(text: string): Omit<ParsedFile, "ok" | "format"> {
  const records: Record<string, string>[] = [];
  let record: Record<string, string> = {};
  let inAccount = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    if (line.startsWith("!")) {
      inAccount = /^!Account/i.test(line);
      record = {};
      continue;
    }
    if (line === "^") {
      if (!inAccount && Object.keys(record).length > 0) records.push(record);
      record = {};
      continue;
    }
    const code = line[0].toUpperCase();
    // The first of each field wins. Split lines (S, E, $) repeat codes we don't read.
    if (!(code in record)) record[code] = line.slice(1).trim();
  }
  if (!inAccount && Object.keys(record).length > 0) records.push(record);

  const rows: ParsedRow[] = [];
  const skipped: number[] = [];
  records.forEach((r, i) => {
    const date = qifDate(r.D ?? "");
    const amountCents = parseBankAmount(r.T ?? r.U ?? "");
    if (date === null || amountCents === null) {
      skipped.push(i + 1);
      return;
    }
    rows.push({
      date,
      amountCents,
      description: describe(r.P ?? "", r.M ?? "").replace(/\s+/g, " "),
    });
  });

  const first = records[0] ?? {};
  const columns: DetectedColumn[] = [
    { heading: "D", sample: first.D ?? "", role: "date" },
    { heading: "P", sample: first.P ?? "", role: "description" },
    { heading: "M", sample: first.M ?? "", role: "description" },
    { heading: "T", sample: first.T ?? first.U ?? "", role: "amount" },
  ];
  return {
    layout: "qif",
    needsCheck: false,
    columns,
    rows,
    warnings: skippedWarning(skipped, "transaction"),
  };
}
