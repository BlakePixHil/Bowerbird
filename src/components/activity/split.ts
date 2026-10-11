import type { ActivityRow, CategoryChoice } from "@/lib/access";
import { formatMoney } from "@/lib/money";

/**
 * The split editor's arithmetic, from the "Split a transaction" board. Amounts are positive cents
 * here, whichever way the money went; the server gives them the row's sign.
 */

export type DraftPart = {
  key: string;
  categoryId: string | null;
  cents: number;
  /** What's in the amount field while someone types, or null to show `cents`. */
  text: string | null;
};

const money = (cents: number) => formatMoney(cents);

/** "40.00", for the amount field. */
export const plain = (cents: number) =>
  `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

/**
 * `n` parts as even as whole dollars allow, the first one taking what's left over, as the board's
 * "Half and half" does: $64.00 in three is $22, $21, $21. Under a dollar a part, it shares cents.
 */
export function evenCents(total: number, n: number): number[] {
  const step = total >= n * 100 ? 100 : 1;
  const base = Math.floor(total / n / step) * step;
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? total - base * n : 0));
}

/**
 * What a part's category can be: never a transfer. Money out splits into spending categories,
 * money in into income first, then spending. Coloured categories come first, as in the grid.
 */
export function partChoices(
  categories: readonly CategoryChoice[],
  row: Pick<ActivityRow, "amountCents">,
): CategoryChoice[] {
  const moneyIn = row.amountCents > 0;
  return categories
    .filter((c) => c.kind === "spending" || (moneyIn && c.kind === "income"))
    .sort(
      (a, b) =>
        Number(moneyIn && b.kind === "income") - Number(moneyIn && a.kind === "income") ||
        (a.colourSlot ?? 10) - (b.colourSlot ?? 10) ||
        a.sortOrder - b.sortOrder,
    );
}

/** Where the editor starts: the saved parts, or two halves with the row's category first. */
export function startingParts(
  row: Pick<ActivityRow, "amountCents" | "category" | "parts">,
  choices: readonly CategoryChoice[],
): DraftPart[] {
  if (row.parts.length > 0)
    return row.parts.map((part) => ({
      key: part.category.id,
      categoryId: part.category.id,
      cents: Math.abs(part.cents),
      text: null,
    }));
  const first = choices.some((c) => c.id === row.category?.id) ? row.category!.id : null;
  const [a, b] = evenCents(Math.abs(row.amountCents), 2);
  return [
    { key: "first", categoryId: first, cents: a, text: null },
    { key: "second", categoryId: null, cents: b, text: null },
  ];
}

export type SplitState = {
  sum: number;
  /** What's still to split: negative when the parts come to more than the payment. */
  left: number;
  tone: "good" | "warn" | "crit";
  words: string;
  /** Why it can't be saved yet, or null when it can. */
  why: string | null;
};

export function splitState(total: number, parts: readonly DraftPart[]): SplitState {
  const sum = parts.reduce((n, part) => n + part.cents, 0);
  const left = total - sum;
  const why = parts.some((part) => !part.categoryId)
    ? "Pick a category for each part"
    : parts.some((part) => part.cents <= 0)
      ? "Give every part an amount, or remove it"
      : left > 0
        ? `Split ${money(left)} more to save`
        : left < 0
          ? `Take ${money(-left)} off to save`
          : null;
  return {
    sum,
    left,
    tone: left === 0 ? "good" : left > 0 ? "warn" : "crit",
    words:
      left === 0
        ? `All ${money(total)} split`
        : left > 0
          ? `${money(left)} left to split`
          : `${money(-left)} too much`,
    why,
  };
}

/** "Each part counts in its own budget and report: $40.00 in Groceries and $24.00 in Shopping." */
export function countsLine(
  parts: readonly DraftPart[],
  nameOf: (id: string) => string | undefined,
): string {
  const bits = parts.flatMap((part) => {
    const name = part.categoryId ? nameOf(part.categoryId) : undefined;
    return name && part.cents > 0 ? [`${money(part.cents)} in ${name}`] : [];
  });
  const lead = "Each part counts in its own budget and report";
  if (bits.length === 0) return `${lead}.`;
  if (bits.length === 1) return `${lead}: ${bits[0]}.`;
  return `${lead}: ${bits.slice(0, -1).join(", ")} and ${bits.at(-1)}.`;
}

/** "Half and half", "Even three ways" and so on. */
export function evenLabel(n: number): string {
  const words = ["", "", "", "three", "four", "five", "six"];
  return n === 2 ? "Half and half" : `Even ${words[n] ?? n} ways`;
}

/** "Back to $40 and $24", for going back to the saved split. */
export function backLabel(saved: readonly DraftPart[]): string {
  const amounts = saved.map((part) => formatMoney(part.cents, { decimals: "auto", sign: "never" }));
  return `Back to ${amounts.slice(0, -1).join(", ")} and ${amounts.at(-1)}`;
}
