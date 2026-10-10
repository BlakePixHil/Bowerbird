import { MINUS } from "./cents";

/** part ÷ whole, or null when whole is zero (there's nothing to compare against). */
export function ratio(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return part / whole;
}

/** How much `to` changed from `from`, as a ratio. Null when `from` is zero. */
export function percentChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return (to - from) / Math.abs(from);
}

/** Format a ratio as a percentage: 0.42 → "42%", −0.051 → "−5%". Null shows as an en dash. */
export function formatPercent(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return "–";
  const rounded = Math.abs(value * 100).toFixed(digits);
  const isZero = Number(rounded) === 0;
  return `${value < 0 && !isZero ? MINUS : ""}${rounded}%`;
}
