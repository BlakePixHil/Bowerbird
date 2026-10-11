import { describe, expect, it } from "vitest";
import type { CategoryChoice } from "@/lib/access";
import {
  backLabel,
  countsLine,
  evenCents,
  evenLabel,
  partChoices,
  plain,
  splitState,
  startingParts,
  type DraftPart,
} from "./split";

const category = (
  id: string,
  kind: CategoryChoice["kind"],
  colourSlot: number | null,
  sortOrder: number,
): CategoryChoice => ({ id, name: id, kind, icon: null, colourSlot, sortOrder });

const groceries = category("Groceries", "spending", 1, 2);
const shopping = category("Shopping", "spending", null, 5);
const eatingOut = category("Eating out", "spending", 2, 3);
const pay = category("Pay", "income", 4, 0);
const transfers = category("Transfers", "transfer", null, 9);
const all = [shopping, transfers, pay, groceries, eatingOut];

const part = (categoryId: string | null, cents: number): DraftPart => ({
  key: categoryId ?? "none",
  categoryId,
  cents,
  text: null,
});

describe("split editor", () => {
  it("writes an amount for the field", () => {
    expect(plain(4_000)).toBe("40.00");
    expect(plain(5)).toBe("0.05");
    expect(plain(123_456)).toBe("1234.56");
  });

  it("shares a payment out in whole dollars, the first part taking the rest", () => {
    expect(evenCents(6_400, 2)).toEqual([3_200, 3_200]);
    expect(evenCents(6_400, 3)).toEqual([2_200, 2_100, 2_100]);
    expect(evenCents(3_122, 2)).toEqual([1_622, 1_500]);
    // Under a dollar a part, it shares cents so no part is empty.
    expect(evenCents(150, 2)).toEqual([75, 75]);
    expect(evenCents(5, 3)).toEqual([3, 1, 1]);
    for (const [total, n] of [
      [6_400, 3],
      [3_122, 2],
      [999, 6],
    ])
      expect(evenCents(total, n).reduce((a, b) => a + b, 0)).toBe(total);
  });

  it("offers spending for money out, and income first for money in, never transfers", () => {
    expect(partChoices(all, { amountCents: -6_400 }).map((c) => c.id)).toEqual([
      "Groceries",
      "Eating out",
      "Shopping",
    ]);
    expect(partChoices(all, { amountCents: 6_400 }).map((c) => c.id)).toEqual([
      "Pay",
      "Groceries",
      "Eating out",
      "Shopping",
    ]);
  });

  it("starts from the saved parts, or two halves with the row's category first", () => {
    const choices = partChoices(all, { amountCents: -6_400 });
    expect(
      startingParts(
        {
          amountCents: -6_400,
          category: groceries,
          parts: [
            { category: groceries, cents: -4_000 },
            { category: shopping, cents: -2_400 },
          ],
        },
        choices,
      ).map((p) => [p.categoryId, p.cents]),
    ).toEqual([
      ["Groceries", 4_000],
      ["Shopping", 2_400],
    ]);
    expect(
      startingParts({ amountCents: -6_400, category: groceries, parts: [] }, choices).map((p) => [
        p.categoryId,
        p.cents,
      ]),
    ).toEqual([
      ["Groceries", 3_200],
      [null, 3_200],
    ]);
    // A row in a category a part can't use starts with both parts empty.
    expect(
      startingParts({ amountCents: -6_400, category: transfers, parts: [] }, choices).map(
        (p) => p.categoryId,
      ),
    ).toEqual([null, null]);
  });

  it("says what's left and why it can't be saved yet", () => {
    expect(splitState(6_400, [part("Groceries", 4_000), part("Shopping", 2_400)])).toEqual({
      sum: 6_400,
      left: 0,
      tone: "good",
      words: "All $64.00 split",
      why: null,
    });
    const short = splitState(6_400, [part("Groceries", 4_000), part("Shopping", 2_300)]);
    expect([short.tone, short.words, short.why]).toEqual([
      "warn",
      "$1.00 left to split",
      "Split $1.00 more to save",
    ]);
    const over = splitState(6_400, [part("Groceries", 4_000), part("Shopping", 2_500)]);
    expect([over.tone, over.words, over.why]).toEqual([
      "crit",
      "$1.00 too much",
      "Take $1.00 off to save",
    ]);
    expect(splitState(6_400, [part("Groceries", 6_400), part(null, 0)]).why).toBe(
      "Pick a category for each part",
    );
    expect(splitState(6_400, [part("Groceries", 6_400), part("Shopping", 0)]).why).toBe(
      "Give every part an amount, or remove it",
    );
  });

  it("says how each part counts", () => {
    const name = (id: string) => id;
    expect(countsLine([part("Groceries", 4_000), part("Shopping", 2_400)], name)).toBe(
      "Each part counts in its own budget and report: $40.00 in Groceries and $24.00 in Shopping.",
    );
    expect(
      countsLine(
        [part("Groceries", 2_000), part("Shopping", 2_400), part("Eating out", 2_000)],
        name,
      ),
    ).toBe(
      "Each part counts in its own budget and report: $20.00 in Groceries, $24.00 in Shopping and $20.00 in Eating out.",
    );
    expect(countsLine([part("Groceries", 6_400), part(null, 0)], name)).toBe(
      "Each part counts in its own budget and report: $64.00 in Groceries.",
    );
    expect(countsLine([part(null, 0), part(null, 0)], name)).toBe(
      "Each part counts in its own budget and report.",
    );
  });

  it("names the quick chips", () => {
    expect(evenLabel(2)).toBe("Half and half");
    expect(evenLabel(3)).toBe("Even three ways");
    expect(evenLabel(6)).toBe("Even six ways");
    expect(backLabel([part("Groceries", 4_000), part("Shopping", 2_400)])).toBe(
      "Back to $40 and $24",
    );
    expect(
      backLabel([part("Groceries", 1_873), part("Shopping", 1_249), part("Eating out", 500)]),
    ).toBe("Back to $18.73, $12.49 and $5");
  });
});
