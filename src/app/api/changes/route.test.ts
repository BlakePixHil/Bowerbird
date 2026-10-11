import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../../../tests/db";
import type { SignedIn } from "@/lib/auth";
import type { Db } from "@/lib/db";
import { accounts, households, members, transactions, users } from "@/lib/db/schema";

const state = vi.hoisted(() => ({ db: null as unknown as Db, me: null as SignedIn | null }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));
vi.mock("@/lib/auth", () => ({
  apiMember: async () => state.me ?? Response.json({ error: "Sign in first" }, { status: 401 }),
}));

const { POST } = await import("./route");

const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  olive: "00000000-0000-4000-8000-0000000000a1",
  everyday: "00000000-0000-4000-8000-000000000b01",
};

let close: () => Promise<void>;
let coffee: string;

const send = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost:3000/api/changes", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeAll(async () => {
  let db: Db;
  ({ db, close } = await createTestDb());
  state.db = db;
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
  [{ id: coffee }] = await db
    .insert(transactions)
    .values({
      householdId: ids.home,
      accountId: ids.everyday,
      date: "2026-10-09",
      amountCents: -5_50,
      descriptionRaw: "COFFEE CART",
      source: "file",
    })
    .returning({ id: transactions.id });
  state.me = {
    user: { id: user.id, name: "Olive", email: "olive@example.com" },
    member: {
      id: ids.olive,
      role: "owner",
      displayName: "Olive",
      joinedAt: new Date(),
      installedAt: null,
      installPromptDoneAt: null,
    },
    household: { id: ids.home, name: "Home", timezone: "Australia/Sydney" },
  };
});
afterAll(async () => close());

describe("sending changes made offline", () => {
  const note = (text: string, id = randomUUID()) => ({
    memberId: ids.olive,
    kind: "note",
    change: { id, transactionId: coffee, note: text },
  });

  it("saves each change once, however many times it's sent", async () => {
    const change = note("For the team");
    const first = await send(change);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, note: "For the team" });
    expect(await (await send(change)).json()).toEqual({ ok: true, already: true });
    const [row] = await state.db.select().from(transactions).where(eq(transactions.id, coffee));
    expect(row.note).toBe("For the team");
  });

  it("answers a refused change with why, so the queue can drop it", async () => {
    const response = await send({
      ...note(""),
      change: { id: randomUUID(), transactionId: coffee },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      error: "That change didn't make sense. Try again.",
    });
  });

  it("only takes changes from this app's own pages", async () => {
    expect((await send(note("x"), { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(
      (await send(note("x"), { "sec-fetch-site": "", origin: "https://evil.example" })).status,
    ).toBe(403);
    expect(
      (await send(note("x"), { "sec-fetch-site": "", origin: "http://localhost:3000" })).status,
    ).toBe(200);
    expect((await send(note("x"), { "content-type": "text/plain" })).status).toBe(415);
  });

  it("refuses strangers, someone else's changes and nonsense", async () => {
    const me = state.me;
    state.me = null;
    expect((await send(note("x"))).status).toBe(401);
    state.me = me;
    expect((await send({ ...note("x"), memberId: randomUUID() })).status).toBe(409);
    expect((await send({ ...note("x"), kind: "delete-everything" })).status).toBe(400);
    expect((await send("{not json")).status).toBe(400);
    expect((await send(JSON.stringify(note("x".repeat(40_000))))).status).toBe(413);
  });
});
