import { assertCents, MINUS } from "./cents";

export type FormatMoneyOptions = {
  /** "always" shows cents ($1,234.50), "never" rounds to dollars ($1,235), "auto" hides .00. */
  decimals?: "always" | "never" | "auto";
  /** "auto" marks money out with a minus, "always" also marks money in with +, "never" shows neither. */
  sign?: "auto" | "always" | "never";
};

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format cents the Australian way: $1,234.56, and −$86.20 with a real minus sign for money out.
 * Rounding to whole dollars goes half away from zero, so −$0.50 becomes −$1.
 */
export function formatMoney(cents: number, options: FormatMoneyOptions = {}): string {
  assertCents(cents);
  const { decimals = "always", sign = "auto" } = options;
  const absolute = Math.abs(cents);

  let body: string;
  if (decimals === "never" || (decimals === "auto" && absolute % 100 === 0)) {
    body = groupThousands(String(Math.round(absolute / 100)));
  } else {
    const dollars = Math.floor(absolute / 100);
    const rest = String(absolute % 100).padStart(2, "0");
    body = `${groupThousands(String(dollars))}.${rest}`;
  }

  const isZero = /^[0,.]+$/.test(body);
  let prefix = "";
  if (!isZero && sign !== "never") {
    if (cents < 0) prefix = MINUS;
    else if (sign === "always") prefix = "+";
  }
  return `${prefix}$${body}`;
}

/** Plain-words cost, for example A$16 when talking about what something costs. */
export function formatCost(cents: number): string {
  return `A${formatMoney(cents, { decimals: "auto", sign: "never" })}`;
}
