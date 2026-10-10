/**
 * Money is always a signed integer number of cents in AUD. Negative is money out.
 * These helpers keep it that way: no floats, no silent overflow.
 */

/** A real minus sign (U+2212), used for money out on screen. */
export const MINUS = "−";

export function isCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function assertCents(value: unknown, label = "amount"): asserts value is number {
  if (!isCents(value)) throw new RangeError(`${label} must be a whole number of cents`);
}

/** Add amounts of cents. Throws if any value isn't whole cents or the total isn't safe. */
export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    assertCents(value);
    total += value;
    if (!Number.isSafeInteger(total)) throw new RangeError("total is too large");
  }
  return total;
}

/**
 * Share a total between weights without losing a cent. Rounds each share down, then hands the
 * leftover cents one at a time to the shares with the biggest remainders.
 * allocateCents(1000, [1, 1, 1]) gives [334, 333, 333].
 */
export function allocateCents(total: number, weights: readonly number[]): number[] {
  assertCents(total, "total");
  if (weights.length === 0) throw new RangeError("weights must not be empty");
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new RangeError("weights must be zero or more");
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) throw new RangeError("weights must not all be zero");

  const sign = total < 0 ? -1 : 1;
  const absolute = Math.abs(total);
  const exact = weights.map((w) => (absolute * w) / weightSum);
  const shares = exact.map(Math.floor);
  let leftover = absolute - shares.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; leftover > 0; i = (i + 1) % order.length, leftover--) {
    shares[order[i].index] += 1;
  }
  return shares.map((share) => share * sign || 0);
}
