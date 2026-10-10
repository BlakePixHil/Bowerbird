import { formatMoney, parts, type PlainDate } from "@/lib/money";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Whole dollars, such as $2,220 or −$86. Charts never show cents. */
export function dollars(cents: number): string {
  return formatMoney(Math.round(cents), { decimals: "never" });
}

/** Short money for axis labels: $1,000 and $9,500 stay whole, then $15k, $250k and $1.25m. */
export function shortMoney(cents: number): string {
  const value = Math.abs(cents) / 100;
  const sign = cents < 0 ? "−" : "";
  if (value >= 1_000_000) return `${sign}$${trim((value / 1_000_000).toFixed(2))}m`;
  if (value >= 10_000) return `${sign}$${trim((value / 1000).toFixed(1))}k`;
  return dollars(cents);
}

function trim(number: string): string {
  return number.replace(/\.?0+$/, "");
}

/** A date for a chart axis in Geist Mono capitals, such as 1 OCT. */
export function axisDate(date: PlainDate): string {
  const p = parts(date);
  return `${p.day} ${MONTHS[p.month - 1]}`;
}
