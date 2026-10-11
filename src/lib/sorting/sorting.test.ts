import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import type { Db } from "@/lib/db";
import { accounts, categories, households, members, transactions, users } from "@/lib/db/schema";
import { countSorted, previewSorting, sortTransactions, STEPS, type SortingStep } from ".";
import { cleanShopNames } from "./merchants";

let db: Db;
let close: () => Promise<void>;
const home = "00000000-0000-4000-8000-000000000001";
let accountId: string;
let groceries: string;

/** A made-up step: anything from WOOLWORTHS is Groceries. */
const groceriesStep: SortingStep = async (_context, rows) => {
  for (const row of rows) {
    if (row.description.startsWith("WOOLWORTHS")) {
      row.category = {
        id: groceries,
        name: "Groceries",
        kind: "spending",
        icon: "cart",
        colourSlot: 2,
      };
    }
  }
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(households).values({ id: home, name: "Home" });
  const [user] = await db.insert(users).values({ name: "O", email: "o@example.com" }).returning();
  const [member] = await db
    .insert(members)
    .values({ householdId: home, userId: user.id, role: "owner", displayName: "O" })
    .returning();
  const [account] = await db
    .insert(accounts)
    .values({ householdId: home, ownerMemberId: member.id, name: "Everyday" })
    .returning();
  accountId = account.id;
  const [category] = await db
    .insert(categories)
    .values({ householdId: home, name: "Groceries" })
    .returning();
  groceries = category.id;
});
afterAll(async () => close());

const row = (description: string) => ({
  accountId,
  date: "2026-09-01",
  amountCents: -1000,
  description,
});

describe("the sorting pipeline", () => {
  it("names the shop first, and leaves rows to check until rules sort them", async () => {
    expect(STEPS[0]).toBe(cleanShopNames);
    const preview = await previewSorting(db, home, [row("WOOLWORTHS 1187")]);
    expect(preview[0].merchant).toEqual({ id: null, name: "Woolworths" });
    expect(countSorted(preview)).toEqual({ sorted: 0, toCheck: 1, transfers: 0 });
  });

  it("previews what each step decides without changing the rows it was given", async () => {
    const rows = [row("WOOLWORTHS 1187"), row("NETFLIX.COM")];
    const preview = await previewSorting(db, home, rows, [groceriesStep]);
    expect(preview.map((r) => r.category?.name ?? null)).toEqual(["Groceries", null]);
    expect(rows[0]).not.toHaveProperty("category");
  });

  it("saves each saved row's category and counts what's left", async () => {
    const saved = await db
      .insert(transactions)
      .values(
        ["WOOLWORTHS 1187", "NETFLIX.COM"].map((descriptionRaw) => ({
          householdId: home,
          accountId,
          date: "2026-09-01",
          amountCents: -1000,
          descriptionRaw,
          source: "file" as const,
        })),
      )
      .returning();
    const counts = await sortTransactions(
      db,
      home,
      saved.map((t) => ({ ...row(t.descriptionRaw), id: t.id })),
      [groceriesStep],
    );
    expect(counts).toEqual({ sorted: 1, toCheck: 1, transfers: 0 });
    const after = await db
      .select({ id: transactions.id, categoryId: transactions.categoryId })
      .from(transactions)
      .where(eq(transactions.accountId, accountId));
    expect(Object.fromEntries(after.map((t) => [t.id, t.categoryId]))).toEqual({
      [saved[0].id]: groceries,
      [saved[1].id]: null,
    });
  });
});
