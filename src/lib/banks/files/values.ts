import { clampedDate, isPlainDate, parseMoney, type PlainDate } from "@/lib/money";

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function plainDate(year: number, month: number, day: number): PlainDate | null {
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = clampedDate(year, month, day);
  // clampedDate moves 31 Feb to 28 Feb; a bank date like that is broken, not a different day.
  return isPlainDate(date) && Number(date.slice(8)) === day ? date : null;
}

/**
 * Reads a date the way Australian banks write them: day first (01/09/2026, 1/9/26, 01-09-2026,
 * 01.09.2026), ISO (2026-09-01), or with a month name (1 Sep 2026, 01-Sep-26). A time after the
 * date is ignored. Returns null for anything else, including month-first dates.
 */
export function parseBankDate(input: string): PlainDate | null {
  const text = input.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(text);
  if (match) return plainDate(Number(match[1]), Number(match[2]), Number(match[3]));

  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:\s.*)?$/.exec(text);
  if (match) return plainDate(Number(match[3]), Number(match[2]), Number(match[1]));

  match = /^(\d{1,2})[\s/-]+([A-Za-z]{3,9})\.?[\s/,-]+(\d{4}|\d{2})(?:\s.*)?$/.exec(text);
  if (match) {
    const name = match[2].toLowerCase();
    const month = MONTHS[name] ?? MONTHS[name.slice(0, 3)];
    if (month) return plainDate(Number(match[3]), month, Number(match[1]));
  }
  return null;
}

/**
 * Reads an amount from a bank file as signed cents: everything parseMoney accepts, plus a
 * trailing CR or DR (DR is money out). Returns null for anything else.
 */
export function parseBankAmount(input: string): number | null {
  const text = input.trim();
  const marked = /^(.*?)\s*(CR|DR)$/i.exec(text);
  if (marked) {
    const cents = parseMoney(marked[1]);
    if (cents === null) return null;
    return marked[2].toUpperCase() === "DR" ? -Math.abs(cents) : Math.abs(cents);
  }
  return parseMoney(text);
}

/** Lists numbers in plain words: "row 4", "rows 4 and 9", "rows 4, 9, 12 and 2 more". */
export function rowList(numbers: number[], noun = "row"): string {
  const shown = numbers.slice(0, 3).map(String);
  const more = numbers.length - shown.length;
  if (more > 0) return `${noun}s ${shown.join(", ")} and ${more} more`;
  if (shown.length === 1) return `${noun} ${shown[0]}`;
  return `${noun}s ${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
}

/** The warning for rows (or transactions, in OFX and QIF) that couldn't be read. */
export function skippedWarning(numbers: number[], noun = "row"): string[] {
  if (numbers.length === 0) return [];
  const count = numbers.length === 1 ? `1 ${noun} was` : `${numbers.length} ${noun}s were`;
  return [
    `${count} left out because the date or amount couldn't be read (${rowList(numbers, noun)}).`,
  ];
}
