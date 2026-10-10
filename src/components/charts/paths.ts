/** One decimal place is plenty for SVG coordinates and keeps paths short. */
export function n1(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return (Object.is(rounded, -0) ? 0 : rounded).toString();
}

export type XY = readonly [number, number];

/** A line through every point, in order. */
export function linePath(points: readonly XY[]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${n1(x)} ${n1(y)}`).join(" ");
}

/** The line closed down to `baseline`, for the soft wash under a line. */
export function areaPath(points: readonly XY[], baseline: number): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)} L${n1(last[0])} ${n1(baseline)} L${n1(first[0])} ${n1(baseline)} Z`;
}

/** The area between a top and a bottom edge sharing the same x values, for a likely range. */
export function bandPath(top: readonly XY[], bottom: readonly XY[]): string {
  if (top.length === 0) return "";
  const back = [...bottom].reverse();
  return `${linePath(top)} ${back.map(([x, y]) => `L${n1(x)} ${n1(y)}`).join(" ")} Z`;
}

/**
 * A bar standing on `base` and reaching `end`, with only the far end rounded. Works upwards (money
 * in) and downwards (money out). Returns nothing for a bar too short to see.
 */
export function barPath(x: number, width: number, base: number, end: number, radius = 4): string {
  const height = Math.abs(end - base);
  if (height < 0.5) return "";
  const r = Math.min(radius, height, width / 2);
  const dir = end < base ? 1 : -1;
  return (
    `M${n1(x)} ${n1(base)} V${n1(end + dir * r)} ` +
    `Q${n1(x)} ${n1(end)} ${n1(x + r)} ${n1(end)} H${n1(x + width - r)} ` +
    `Q${n1(x + width)} ${n1(end)} ${n1(x + width)} ${n1(end + dir * r)} V${n1(base)} Z`
  );
}

/** The stroke-dasharray that draws `fraction` of a circle of radius `r`. */
export function ringDash(fraction: number, r: number): string {
  const circumference = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, fraction));
  return `${n1(f * circumference)} ${n1(circumference)}`;
}

/**
 * The ends of a short tick across a ring at `fraction` of the way round, starting from the top and
 * going clockwise, such as where spending is expected to be today.
 */
export function ringTick(
  fraction: number,
  centre: number,
  r: number,
  reach: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const angle = ((-90 + Math.min(1, Math.max(0, fraction)) * 360) * Math.PI) / 180;
  const at = (radius: number) => [
    centre + Math.cos(angle) * radius,
    centre + Math.sin(angle) * radius,
  ];
  const [x1, y1] = at(r - reach);
  const [x2, y2] = at(r + reach);
  return { x1, y1, x2, y2 };
}
