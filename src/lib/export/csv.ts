/**
 * CSV files that open cleanly in a spreadsheet: UTF-8 with a byte order mark so Excel reads the
 * accents, Windows line endings, and quotes only where a value needs them. Text that starts like
 * a formula gets a leading apostrophe, so a bank description such as "=HYPERLINK(...)" stays text.
 */

/** Money, written as dollars and cents from whole cents: { cents: -1250 } is -12.50. */
export type Money = { cents: number };

export type Cell = string | number | boolean | Money | null | undefined;

const FORMULA = /^[=+\-@\t\r]/;

/** -1250 cents is "-12.50". Whole-number maths only, so nothing is lost to floating point. */
export function dollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** One value as it goes in the file. */
export function cell(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "object") return dollars(value.cents);
  const text = FORMULA.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A whole file: the header row, then one row per entry. */
export function csv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(cell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
