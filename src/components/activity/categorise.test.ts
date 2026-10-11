import { describe, expect, it } from "vitest";
import type { CategoryChoice } from "@/lib/access";
import { gridOf } from "./Categorise";

const choice = (name: string, sortOrder: number, more: Partial<CategoryChoice> = {}) => ({
  id: name,
  name,
  kind: "spending" as const,
  icon: null,
  colourSlot: null,
  sortOrder,
  ...more,
});
const names = (list: CategoryChoice[]) => list.map((c) => c.name);

describe("the category grid", () => {
  const list = [
    choice("Groceries", 0),
    choice("Eating out", 1, { colourSlot: 2 }),
    choice("Transport", 2),
    choice("Fuel", 3),
    choice("Bills", 4),
    choice("Housing", 5, { colourSlot: 1 }),
    choice("Insurance", 6),
    choice("Health", 7),
    choice("Gifts", 8),
    choice("Income", 9, { kind: "income" }),
  ];

  it("shows seven: the coloured categories first, then the rest in order", () => {
    expect(names(gridOf(list, { amountCents: -100 }, null))).toEqual([
      "Housing",
      "Eating out",
      "Groceries",
      "Transport",
      "Fuel",
      "Bills",
      "Insurance",
    ]);
  });

  it("puts Income first for money in, and always shows the row's own category", () => {
    expect(names(gridOf(list, { amountCents: 100 }, null))[0]).toBe("Income");
    expect(names(gridOf(list, { amountCents: -100 }, "Gifts")).at(-1)).toBe("Gifts");
  });
});
