import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import type { Viewer } from "@/lib/access";
import type { Db } from "@/lib/db";
import {
  accounts,
  appliedChanges,
  categories,
  households,
  members,
  transactions,
  transactionTags,
  users,
} from "@/lib/db/schema";
import { addStartingCategories } from "@/lib/sorting/categories";
import { applyChange, applyFromAction, CHANGE_MEMORY_DAYS, once } from ".";

const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  olive: "00000000-0000-4000-8000-0000000000a1",
  everyday: "00000000-0000-4000-8000-000000000b01",
};
const olive: Viewer = { memberId: ids.olive, householdId: ids.home };

let db: Db;
let close: () => Promise<void>;
let category: Record<string, string>;
let coffee: string;
let books: string;

const categoryOf = async (id: string) =>
  (await db.select().from(transactions).where(eq(transactions.id, id)))[0].categoryId;
const saved = async (id: string) =>
  (await db.select().from(appliedChanges).where(eq(appliedChanges.id, id))).length;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(households).values({ id: ids.home, name: "Home" });
  const [user] = await db
    .insert(users)
    .values({ name: "Olive", email: "olive@example.com" })
    .returning();
  await db.insert(members).values({
    id: ids.olive,
    householdId: ids.home,
    userId: user.id,
    role: "owner",
    displayName: "Olive",
  });
  await db.insert(accounts).values({
    id: ids.everyday,
    householdId: ids.home,
    ownerMemberId: ids.olive,
    name: "Everyday",
    visibility: "shared",
  });
  await addStartingCategories(db, ids.home);
  category = Object.fromEntries(
    (await db.select().from(categories).where(eq(categories.householdId, ids.home))).map((c) => [
      c.name,
      c.id,
    ]),
  );
  const row = (descriptionRaw: string, amountCents: number) => ({
    householdId: ids.home,
    accountId: ids.everyday,
    date: "2026-10-09",
    amountCents,
    descriptionRaw,
    source: "file" as const,
  });
  [{ id: coffee }, { id: books }] = await db
    .insert(transactions)
    .values([row("COFFEE CART", -5_50), row("BERKELOUW BOOKS", -32_00)])
    .returning({ id: transactions.id });
});
afterAll(async () => close());

describe("saving each change once", () => {
  it("saves a change, and skips a copy of it sent again", async () => {
    const id = randomUUID();
    const change = { id, transactionId: coffee, categoryId: category["Eating out"] };
    expect(await applyChange(db, olive, "category", change)).toMatchObject({ ok: true });
    expect(await categoryOf(coffee)).toBe(category["Eating out"]);
    expect(await applyChange(db, olive, "category", change)).toEqual({ ok: true, already: true });
    expect(await saved(id)).toBe(1);
  });

  it("never lets a late copy undo a newer change", async () => {
    // Made offline, sent, but the answer was lost, so it's still in the queue.
    const first = { id: randomUUID(), transactionId: books, categoryId: category["Shopping"] };
    await applyChange(db, olive, "category", first);
    // Changed again since, on this device or another.
    const newer = { id: randomUUID(), transactionId: books, categoryId: category["Groceries"] };
    await applyChange(db, olive, "category", newer);
    // The queue sends its copy again once there's signal.
    expect(await applyChange(db, olive, "category", first)).toEqual({ ok: true, already: true });
    expect(await categoryOf(books)).toBe(category["Groceries"]);
  });

  it("leaves no id behind for a refused change, so it isn't remembered as saved", async () => {
    const id = randomUUID();
    const result = await applyChange(db, olive, "category", {
      id,
      transactionId: randomUUID(),
      categoryId: category["Groceries"],
    });
    expect(result.ok).toBe(false);
    expect(await saved(id)).toBe(0);
    expect(await applyChange(db, olive, "category", { id: "nope" } as never)).toEqual({
      ok: false,
      error: "That change didn't make sense. Try again.",
    });
  });

  it("does the same for tags, so a tag sent twice goes on once", async () => {
    const change = { id: randomUUID(), transactionId: coffee, add: "Bali 2027" };
    expect(await applyChange(db, olive, "tags", change)).toMatchObject({ ok: true });
    expect(await applyChange(db, olive, "tags", change)).toEqual({ ok: true, already: true });
    const on = await db
      .select()
      .from(transactionTags)
      .where(eq(transactionTags.transactionId, coffee));
    expect(on).toHaveLength(1);
  });

  it("answers a server action's copy as already saved, in its own words", async () => {
    const change = { id: randomUUID(), transactionId: coffee, note: "Flat white for Sam" };
    expect(await applyFromAction(db, olive, "note", change)).toEqual({
      ok: true,
      note: "Flat white for Sam",
    });
    expect(await applyFromAction(db, olive, "note", change)).toEqual({
      ok: false,
      error: "That change is saved already.",
    });
  });

  it(`forgets ids after ${CHANGE_MEMORY_DAYS} days`, async () => {
    const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));
    const old = randomUUID();
    const ok = async () => ({ ok: true as const });
    await once(db, ids.olive, { id: old, kind: "note" }, ok, day(0));
    await once(db, ids.olive, { id: randomUUID(), kind: "note" }, ok, day(CHANGE_MEMORY_DAYS));
    expect(await saved(old)).toBe(1);
    await once(db, ids.olive, { id: randomUUID(), kind: "note" }, ok, day(CHANGE_MEMORY_DAYS + 1));
    expect(await saved(old)).toBe(0);
  });
});
