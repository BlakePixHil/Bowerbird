import type { ColumnRole, DetectedColumn, FileLayout, ParsedRow } from "./types";
import { parseBankAmount, parseBankDate, skippedWarning } from "./values";

/**
 * Splits CSV text into rows of cells: quoted fields (with "" for a quote), commas or newlines
 * inside quotes, CRLF or LF line ends. Each row keeps its line number for messages. Rows that are
 * entirely empty, such as trailing blank lines, are dropped.
 */
export function splitCsv(text: string, delimiter = ","): { line: number; cells: string[] }[] {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  const endRow = () => {
    cells.push(cell);
    if (cells.some((c) => c.trim() !== "")) rows.push({ line: rowLine, cells });
    cells = [];
    cell = "";
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === "") {
      cell = "";
      quoted = true;
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
      rowLine = line;
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || cells.length > 0) endRow();
  return rows.map((row) => ({ line: row.line, cells: row.cells.map((c) => c.trim()) }));
}

/** Commas, unless the first line has more semicolons or tabs. */
export function guessDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (d: string) => first.split(d).length - 1;
  const best = [",", ";", "\t"].reduce((a, b) => (count(b) > count(a) ? b : a));
  return count(best) > 0 ? best : ",";
}

const WESTPAC = ["bank account", "date", "narrative", "debit amount", "credit amount", "balance"];

/** Words in a heading that say what the column holds. Earlier entries claim a column first. */
const HEADINGS: [ColumnRole, RegExp][] = [
  ["balance", /balance/i],
  ["debit", /debit|withdraw|money out|paid out|spent/i],
  ["credit", /credit|deposit|money in|paid in|received/i],
  ["date", /date|posted|when/i],
  ["amount", /amount|value|sum/i],
  ["description", /narrative|description|details|payee|merchant|particulars/i],
  ["description", /memo|transaction|reference/i],
];

type Rows = { line: number; cells: string[] }[];

function share(rows: Rows, index: number, test: (cell: string) => boolean): number {
  const filled = rows.map((row) => row.cells[index] ?? "").filter((cell) => cell !== "");
  if (filled.length === 0) return 0;
  return filled.filter(test).length / filled.length;
}

const isDate = (cell: string) => parseBankDate(cell) !== null;
const isMoney = (cell: string) => parseBankAmount(cell) !== null;

/** A first row with no dates and no amounts in it is a header. */
function hasHeader(rows: Rows): boolean {
  return rows.length > 1 && rows[0].cells.every((cell) => !isDate(cell) && !isMoney(cell));
}

/** Best guess at each column's role from what's in it, for files with unhelpful headings. */
function guessFromValues(rows: Rows, width: number, roles: ColumnRole[]): ColumnRole[] {
  const guessed = [...roles];
  const free = (i: number) => guessed[i] === "ignore";
  const has = (role: ColumnRole) => guessed.includes(role);

  if (!has("date")) {
    const dateColumn = [...Array(width).keys()].find(
      (i) => free(i) && share(rows, i, isDate) >= 0.8,
    );
    if (dateColumn !== undefined) guessed[dateColumn] = "date";
  }
  if (!has("amount") && !has("debit") && !has("credit")) {
    const money = [...Array(width).keys()].filter((i) => free(i) && share(rows, i, isMoney) >= 0.8);
    // The amount goes up and down; a balance usually doesn't change sign.
    const signed = money.find((i) => share(rows, i, (c) => (parseBankAmount(c) ?? 0) < 0) > 0);
    const amount = signed ?? money[0];
    if (amount !== undefined) {
      guessed[amount] = "amount";
      const balance = money.find((i) => i !== amount);
      if (balance !== undefined && !has("balance")) guessed[balance] = "balance";
    }
  }
  if (!has("description")) {
    let best = -1;
    let longest = 0;
    for (let i = 0; i < width; i++) {
      if (!free(i) || share(rows, i, (c) => isDate(c) || isMoney(c)) > 0.5) continue;
      const cells = rows.map((row) => row.cells[i] ?? "");
      const length = cells.reduce((sum, c) => sum + c.length, 0) / cells.length;
      if (length > longest) [best, longest] = [i, length];
    }
    if (best >= 0) guessed[best] = "description";
  }
  return guessed;
}

/** What's missing before rows can be read, in plain words, or null when the columns will do. */
export function missingColumns(roles: readonly ColumnRole[]): string | null {
  if (!roles.includes("date")) return "Choose which column is the date.";
  if (!roles.includes("amount") && !roles.includes("debit") && !roles.includes("credit"))
    return "Choose which column is the amount, or the money out and money in columns.";
  if (!roles.includes("description")) return "Choose which column is the description.";
  return null;
}

function readRows(rows: Rows, roles: readonly ColumnRole[]) {
  const at = (role: ColumnRole) => roles.flatMap((r, i) => (r === role ? [i] : []));
  const [date] = at("date");
  const [amount] = at("amount");
  const [debit] = at("debit");
  const [credit] = at("credit");
  const [balance] = at("balance");
  const descriptions = at("description");

  const parsed: ParsedRow[] = [];
  const skipped: number[] = [];
  for (const { line, cells } of rows) {
    const cell = (i: number | undefined) => (i === undefined ? "" : (cells[i] ?? ""));
    const day = parseBankDate(cell(date));
    let cents: number | null;
    if (amount !== undefined) {
      cents = parseBankAmount(cell(amount));
    } else {
      // Money out and money in in their own columns. Either may be blank, and money out may or
      // may not carry a minus sign.
      const out = cell(debit) === "" ? 0 : parseBankAmount(cell(debit));
      const into = cell(credit) === "" ? 0 : parseBankAmount(cell(credit));
      cents = out === null || into === null ? null : Math.abs(into) - Math.abs(out);
      if (cell(debit) === "" && cell(credit) === "") cents = null;
    }
    if (day === null || cents === null) {
      skipped.push(line);
      continue;
    }
    const row: ParsedRow = {
      date: day,
      amountCents: cents,
      description: descriptions.map(cell).filter(Boolean).join(" ").replace(/\s+/g, " "),
    };
    const balanceCents = cell(balance) === "" ? null : parseBankAmount(cell(balance));
    if (balanceCents !== null) row.balanceCents = balanceCents;
    parsed.push(row);
  }
  return { rows: parsed, warnings: skippedWarning(skipped) };
}

export type CsvResult = {
  layout: FileLayout;
  needsCheck: boolean;
  columns: DetectedColumn[];
  rows: ParsedRow[];
  warnings: string[];
};

/**
 * Reads a CSV export. Westpac's and ANZ's layouts are recognised by their shape. Any other CSV is
 * read from a best guess at its columns, which the person checks. Pass `roles` to read it with the
 * person's own choice of columns instead.
 */
export function readCsv(text: string, roles?: readonly ColumnRole[]): CsvResult | null {
  const all = splitCsv(text, guessDelimiter(text));
  const width = Math.max(0, ...all.map((row) => row.cells.length));
  if (all.length === 0 || width < 2) return null;

  const header = hasHeader(all);
  const headings = header ? all[0].cells : null;
  const data = header ? all.slice(1) : all;
  if (data.length === 0) return null;

  let layout: FileLayout = "other";
  let chosen: ColumnRole[];
  const names = headings?.map((h) => h.toLowerCase().replace(/\s+/g, " "));
  if (roles) {
    chosen = [...Array(width).keys()].map((i) => roles[i] ?? "ignore");
  } else if (names && WESTPAC.every((name) => names.includes(name))) {
    layout = "westpac";
    chosen = names.map((name): ColumnRole => {
      if (name === "date") return "date";
      if (name === "narrative") return "description";
      if (name === "debit amount") return "debit";
      if (name === "credit amount") return "credit";
      if (name === "balance") return "balance";
      return "ignore";
    });
  } else if (
    !header &&
    width === 3 &&
    share(data, 0, isDate) === 1 &&
    share(data, 1, isMoney) === 1 &&
    share(data, 2, isMoney) < 1
  ) {
    layout = "anz";
    chosen = ["date", "amount", "description"];
  } else {
    // Every bank export has a column of dates and one of amounts. Without them it's another file.
    const columnsWhere = (test: (cell: string) => boolean) =>
      [...Array(width).keys()].some((i) => share(data, i, test) >= 0.5);
    if (!columnsWhere(isDate) || !columnsWhere(isMoney)) return null;
    // Each role takes the first column whose heading names it and whose values agree.
    const agreed: ColumnRole[] = Array(width).fill("ignore");
    for (const [role, pattern] of HEADINGS) {
      if (agreed.includes(role)) continue;
      const index = [...Array(width).keys()].find((i) => {
        if (agreed[i] !== "ignore" || !pattern.test(headings?.[i] ?? "")) return false;
        if (role === "date") return share(data, i, isDate) >= 0.5;
        if (role === "description") return true;
        return share(data, i, isMoney) >= 0.5;
      });
      if (index !== undefined) agreed[index] = role;
    }
    chosen = guessFromValues(data, width, agreed);
    if (chosen.includes("amount")) {
      chosen = chosen.map((role) => (role === "debit" || role === "credit" ? "ignore" : role));
    }
  }

  const columns = [...Array(width).keys()].map((i): DetectedColumn => ({
    heading: headings?.[i] ?? null,
    sample: data[0].cells[i] ?? "",
    role: chosen[i],
  }));
  const missing = missingColumns(chosen);
  if (missing) return { layout, needsCheck: true, columns, rows: [], warnings: [missing] };
  const { rows, warnings } = readRows(data, chosen);
  return { layout, needsCheck: !roles && layout === "other", columns, rows, warnings };
}
