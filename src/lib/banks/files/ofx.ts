import { isPlainDate, type PlainDate } from "@/lib/money";
import type { DetectedColumn, ParsedFile, ParsedRow } from "./types";
import { parseBankAmount, skippedWarning } from "./values";

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * One field's value in an OFX block. Works for the older SGML style, where fields have no closing
 * tag (`<TRNAMT>-31.60`), and for XML (`<TRNAMT>-31.60</TRNAMT>`).
 */
function field(block: string, tag: string): string {
  const match = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block);
  if (!match) return "";
  return match[1]
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (e) => ENTITIES[e.toLowerCase()])
    .trim();
}

/** OFX dates start YYYYMMDD and may carry a time and zone after it. */
function ofxDate(value: string): PlainDate | null {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value);
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  return isPlainDate(date) ? date : null;
}

/** NAME is often cut short and MEMO has the rest, so use whichever says more. */
export function describe(name: string, memo: string): string {
  if (!memo) return name;
  if (!name) return memo;
  const [n, m] = [name.toUpperCase(), memo.toUpperCase()];
  if (m.includes(n)) return memo;
  if (n.includes(m)) return name;
  return `${name} ${memo}`;
}

export function looksLikeOfx(text: string): boolean {
  return /^\s*OFXHEADER:/i.test(text) || /<OFX>/i.test(text);
}

/** Reads every STMTTRN in an OFX (or QBO) file: DTPOSTED, TRNAMT, NAME, MEMO and FITID. */
export function readOfx(text: string): Omit<ParsedFile, "ok" | "format"> {
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? [];
  const rows: ParsedRow[] = [];
  const skipped: number[] = [];
  blocks.forEach((block, i) => {
    const date = ofxDate(field(block, "DTPOSTED"));
    const amountCents = parseBankAmount(field(block, "TRNAMT"));
    if (date === null || amountCents === null) {
      skipped.push(i + 1);
      return;
    }
    const row: ParsedRow = {
      date,
      amountCents,
      description: describe(field(block, "NAME"), field(block, "MEMO")).replace(/\s+/g, " "),
    };
    const id = field(block, "FITID");
    if (id) row.externalId = id;
    rows.push(row);
  });

  const first = blocks[0] ?? "";
  const columns: DetectedColumn[] = [
    { heading: "DTPOSTED", sample: field(first, "DTPOSTED"), role: "date" },
    { heading: "NAME", sample: field(first, "NAME"), role: "description" },
    { heading: "MEMO", sample: field(first, "MEMO"), role: "description" },
    { heading: "TRNAMT", sample: field(first, "TRNAMT"), role: "amount" },
  ];

  const ledger = /<LEDGERBAL>[\s\S]*?(?=<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|$)/i.exec(text)?.[0];
  const balanceDate = ledger ? ofxDate(field(ledger, "DTASOF")) : null;
  const balanceCents = ledger ? parseBankAmount(field(ledger, "BALAMT")) : null;

  return {
    layout: "ofx",
    needsCheck: false,
    columns,
    rows,
    warnings: skippedWarning(skipped, "transaction"),
    ...(balanceDate && balanceCents !== null
      ? { closingBalance: { date: balanceDate, balanceCents } }
      : {}),
  };
}
