/** Maps a value from `domain` onto `range` in a straight line, such as cents onto pixels. */
export function linear(
  [d0, d1]: readonly [number, number],
  [r0, r1]: readonly [number, number],
): (value: number) => number {
  const span = d1 - d0;
  return (value) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0));
}

export type NiceScale = { lo: number; hi: number; step: number; ticks: number[] };

/**
 * Widens lo to hi out to tidy steps of 1, 2, 2.5 or 5 times a power of ten, in about `maxTicks`
 * steps. Gives axis labels like $250,000, $260,000, $270,000 rather than odd numbers.
 */
export function niceScale(lo: number, hi: number, maxTicks = 4): NiceScale {
  if (hi < lo) [lo, hi] = [hi, lo];
  const ticks = Math.max(maxTicks, 1);
  // Never finer than one unit, so a scale in cents never steps in fractions of a cent.
  const raw = Math.max(hi - lo, ticks) / ticks;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw - 1e-9)!;
  const niceLo = Math.floor(lo / step + 1e-9) * step;
  let niceHi = Math.ceil(hi / step - 1e-9) * step;
  if (niceHi === niceLo) niceHi = niceLo + step;
  const count = Math.round((niceHi - niceLo) / step);
  return {
    lo: niceLo,
    hi: niceHi,
    step,
    ticks: Array.from({ length: count + 1 }, (_, i) => niceLo + i * step),
  };
}

/** The top of a chart's value axis: the largest value plus some room above it, never zero. */
export function headroom(values: readonly number[], factor = 1.1): number {
  const max = Math.max(0, ...values);
  return max === 0 ? 1 : max * factor;
}

/** The value range a chart needs to show, from the lowest value (or zero) to the highest. */
export function extent(values: readonly number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  return [Math.min(0, ...values), Math.max(0, ...values)];
}

/** Which of `count` evenly spread points (first at 0, last at 1) is closest to `fraction`. */
export function nearestPoint(fraction: number, count: number): number {
  if (count <= 1) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(fraction * (count - 1))));
}

/** Which of `count` equal slots (such as months in a bar chart) `fraction` falls in. */
export function slotAt(fraction: number, count: number): number {
  return Math.min(count - 1, Math.max(0, Math.floor(fraction * count)));
}

/**
 * Where a tooltip should sit beside the point at `percent` across the chart, so it never runs off
 * either edge: to the right near the left edge, to the left near the right edge, otherwise centred.
 */
export function tooltipShift(percent: number): string {
  if (percent < 18) return "translateX(14px)";
  if (percent > 82) return "translateX(calc(-100% - 14px))";
  return "translateX(-50%)";
}
