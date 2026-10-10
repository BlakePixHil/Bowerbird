const MINUS_SIGNS = /[−‒–—﹣－]/g;

/**
 * Read an amount someone typed or a bank file contains and return signed cents, or null when it
 * isn't a valid amount. Accepts $1,234.56, -86.2, −$86.20, (86.20), +5, 1234, A$16 and AUD 16.
 * Never goes through floating point, and rejects more than two decimal places.
 */
export function parseMoney(input: string): number | null {
  let text = input.trim().replace(MINUS_SIGNS, "-").replace(/\s+/g, "");
  if (text === "") return null;

  let negative = false;
  let signed = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true;
    signed = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith("-") || text.startsWith("+")) {
    negative = text.startsWith("-") ? !negative : negative;
    signed = true;
    text = text.slice(1);
  } else if (text.endsWith("-")) {
    negative = !negative;
    signed = true;
    text = text.slice(0, -1);
  }
  const withoutCurrency = text.replace(/^(AUD|A\$|\$)/i, "");
  // A sign may sit after the currency ($-86.20), but only if there wasn't one before it.
  if (withoutCurrency !== text && !signed && withoutCurrency.startsWith("-")) {
    negative = true;
    text = withoutCurrency.slice(1);
  } else {
    text = withoutCurrency;
  }

  const match = /^(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{0,2}))?$/.exec(text);
  if (!match || (match[1] === undefined && !match[2])) return null;

  const dollars = (match[1] ?? "0").replace(/,/g, "");
  const centsPart = (match[2] ?? "").padEnd(2, "0");
  const total = Number(dollars) * 100 + Number(centsPart);
  if (!Number.isSafeInteger(total)) return null;
  return negative && total !== 0 ? -total : total;
}
