import { describe, expect, it } from "vitest";
import type { CategoryChoice } from "@/lib/access";
import { ANYTHING, type Find } from "@/lib/access/find";
import {
  amountText,
  daysText,
  filtersKey,
  findChips,
  findEntries,
  findFromParams,
  isAnything,
  rangeText,
  viewName,
  type FindLists,
} from "./find";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const GROCERIES = "cccccccc-0000-4000-8000-000000000003";
const EATING = "dddddddd-0000-4000-8000-000000000004";
const BALI = "eeeeeeee-0000-4000-8000-000000000005";

const category = (id: string, name: string, colourSlot: number | null): CategoryChoice => ({
  id,
  name,
  kind: "spending",
  icon: null,
  colourSlot,
  sortOrder: 0,
});

const lists: FindLists = {
  accounts: [
    { id: A, name: "Everyday", whose: "mine" },
    { id: B, name: "Joint", whose: "shared" },
  ],
  categories: [category(GROCERIES, "Groceries", 1), category(EATING, "Eating out", null)],
  tags: [{ id: BALI, name: "Bali 2027" }],
};

const TODAY = "2026-10-11";
const find = (over: Partial<Find>): Find => ({ ...ANYTHING, ...over });
const fromEntries = (entries: [string, string][]) => {
  const params = new URLSearchParams(entries);
  return findFromParams((key) => params.get(key) ?? undefined);
};

describe("the address", () => {
  it("writes nothing for no filters, and reads nothing back", () => {
    expect(findEntries(ANYTHING)).toEqual([]);
    expect(isAnything(ANYTHING)).toBe(true);
    expect(fromEntries([])).toEqual(ANYTHING);
  });

  it("round trips every filter, with ids sorted so the same filters give the same address", () => {
    const all = find({
      mine: true,
      accounts: [B, A],
      categories: [EATING, GROCERIES],
      tags: [BALI],
      range: "custom",
      from: "2026-09-01",
      to: "2026-09-30",
      min: 2000,
      max: 12050,
      direction: "out",
      transfers: false,
      pending: false,
    });
    const entries = findEntries(all);
    expect(entries.map(([key]) => key)).toEqual([
      "mine",
      "acct",
      "cat",
      "tag",
      "when",
      "from",
      "to",
      "min",
      "max",
      "dir",
      "transfers",
      "pending",
    ]);
    expect(entries[1]).toEqual(["acct", `${A},${B}`]);
    expect(fromEntries(entries)).toEqual({
      ...all,
      accounts: [A, B],
      categories: [GROCERIES, EATING],
    });
    expect(isAnything(all)).toBe(false);
  });

  it("leaves out what doesn't fit", () => {
    expect(
      fromEntries([
        ["acct", "not-an-id"],
        ["cat", `${GROCERIES},,nope`],
        ["when", "forever"],
        ["from", "2026-09-01"],
        ["min", "-5"],
        ["max", "12.5"],
        ["dir", "sideways"],
        ["pending", "yes"],
      ]),
    ).toEqual(find({ accounts: [], categories: [GROCERIES] }));
  });

  it("keeps days only for a custom range", () => {
    const entries = findEntries(find({ range: "month", from: "2026-09-01" }));
    expect(entries).toEqual([["when", "month"]]);
  });

  it("tells two searches with filters apart, and the same ones as the same", () => {
    const one = { search: "coles", find: find({ categories: [GROCERIES, EATING] }) };
    const same = { search: "coles", find: find({ categories: [EATING, GROCERIES] }) };
    expect(filtersKey(one)).toBe(filtersKey(same));
    expect(filtersKey(one)).not.toBe(filtersKey({ ...one, search: "" }));
    expect(filtersKey({ search: "", find: ANYTHING })).toBe("");
  });
});

describe("words", () => {
  it("says days the short way", () => {
    expect(daysText("2026-10-01", "2026-10-11")).toBe("1 to 11 Oct");
    expect(daysText("2026-07-11", "2026-10-11")).toBe("11 Jul to 11 Oct");
    expect(daysText("2025-12-01", "2026-10-11")).toBe("1 Dec 2025 to 11 Oct 2026");
    expect(daysText("2026-10-11", "2026-10-11")).toBe("11 Oct");
  });

  it("says what a range covers, up to today when it has no last day", () => {
    expect(rangeText(ANYTHING, TODAY)).toBe("Any time");
    expect(rangeText(find({ range: "month" }), TODAY)).toBe("1 to 11 Oct");
    expect(rangeText(find({ range: "last" }), TODAY)).toBe("1 to 30 Sep");
    expect(rangeText(find({ range: "3m" }), TODAY)).toBe("12 Jul to 11 Oct");
    expect(rangeText(find({ range: "custom", from: "2026-09-05" }), TODAY)).toBe("From 5 Sep");
    expect(rangeText(find({ range: "custom", to: "2026-09-05" }), TODAY)).toBe("Up to 5 Sep");
    expect(rangeText(find({ range: "custom" }), TODAY)).toBe("Pick the days");
  });

  it("says an amount in whole dollars when it can", () => {
    expect(amountText(ANYTHING)).toBeNull();
    expect(amountText(find({ min: 5000 }))).toBe("$50 or more");
    expect(amountText(find({ max: 12050 }))).toBe("Up to $120.50");
    expect(amountText(find({ min: 5000, max: 12000 }))).toBe("$50 to $120");
    expect(amountText(find({ min: 5000, max: 5000 }))).toBe("$50");
  });
});

describe("findChips", () => {
  it("gives one chip per filter, each taking only its own filter away", () => {
    const picked = find({
      mine: true,
      accounts: [B],
      categories: [GROCERIES, EATING],
      range: "month",
      min: 2000,
      direction: "in",
      transfers: false,
      pending: false,
    });
    const chips = findChips(picked, lists, TODAY);
    expect(chips.map((chip) => chip.label)).toEqual([
      "Mine",
      "Joint only",
      "Groceries",
      "Eating out",
      "This month",
      "$20 or more",
      "Money in",
      "No transfers",
      "No pending",
    ]);
    const groceries = chips.find((chip) => chip.label === "Groceries")!;
    expect(groceries.colour).toBe("c1");
    expect(groceries.without).toEqual({ ...picked, categories: [EATING] });
    expect(chips.find((chip) => chip.label === "Eating out")!.colour).toBe("c-other");
    expect(chips.find((chip) => chip.key === "range")!.without).toEqual({
      ...picked,
      range: null,
    });
  });

  it("counts accounts when more than one is picked, and names a custom range by its days", () => {
    const chips = findChips(
      find({ accounts: [A, B], range: "custom", from: "2026-09-01", to: "2026-09-30" }),
      { ...lists, accounts: [...lists.accounts, { id: BALI, name: "Card", whose: "mine" }] },
      TODAY,
    );
    expect(chips.map((chip) => chip.label)).toEqual(["2 of 3 accounts", "1 to 30 Sep"]);
  });
});

describe("viewName", () => {
  const name = (over: Partial<Find>, search = "") =>
    viewName({ search, find: find(over) }, lists, TODAY);

  it("names a view from what's picked", () => {
    expect(name({ mine: true, categories: [GROCERIES], range: "month" })).toBe(
      "Mine, Groceries, this month",
    );
    expect(name({ tags: [BALI] })).toBe("Bali 2027");
    expect(name({ categories: [GROCERIES, EATING], direction: "out", range: "3m" })).toBe(
      "2 categories, Money out, last 3 months",
    );
    expect(
      name({ categories: [EATING], range: "custom", from: "2026-09-01", to: "2026-09-30" }),
    ).toBe("Eating out, 1 to 30 Sep");
    expect(name({}, "uber")).toBe("“uber”");
  });

  it("falls back to the accounts, then the switches, then a plain name", () => {
    expect(name({ accounts: [B] })).toBe("Joint");
    expect(name({ transfers: false })).toBe("No transfers");
    expect(name({ pending: false })).toBe("Settled");
    expect(name({})).toBe("My view");
  });

  it("keeps to 40 characters, leaving out whole bits before cutting one short", () => {
    expect(
      name({ mine: true, categories: [GROCERIES, EATING], tags: [BALI], min: 2000, max: 12050 }),
    ).toBe("Mine, 2 categories, Bali 2027");
    const long = name({}, "a search that goes on and on and on and on and on");
    expect(long).toHaveLength(40);
    expect(long.endsWith("…")).toBe(true);
  });
});
