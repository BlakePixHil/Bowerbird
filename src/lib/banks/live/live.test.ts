import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../../../tests/db";
import { startMockSimpleFin, type MockSimpleFin } from "../../../../tests/simplefin";
import type { Viewer } from "@/lib/access";
import type { Db } from "@/lib/db";
import {
  accounts,
  balances,
  connections,
  households,
  members,
  transactions,
  users,
} from "@/lib/db/schema";
import { connectSimpleFin } from "../connections";
import {
  claimSyncLease,
  firstSyncProgress,
  guessJoint,
  guessKind,
  listLiveAccounts,
  runFirstSync,
  saveAccountPicks,
  unfinishedFirstSyncs,
  type AccountPick,
  type LiveAccount,
} from ".";

const FIXTURE = JSON.parse(
  readFileSync(
    new URL("../../../../tests/fixtures/simplefin/household.json", import.meta.url),
    "utf8",
  ),
);
/** Rows in the fixture per account. It holds 150 days of made-up history up to 10 Oct 2026. */
const ROWS = {
  "hb-everyday": 76,
  "hb-card": 50,
  "wcu-joint": 50,
  "wcu-saver": 5,
  "wcu-loan": 5,
  "wcu-term": 0,
};

const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  olive: "00000000-0000-4000-8000-0000000000a1",
  pat: "00000000-0000-4000-8000-0000000000a2",
};
const olive: Viewer = { memberId: ids.olive, householdId: ids.home };
const pat: Viewer = { memberId: ids.pat, householdId: ids.home };
// Mid-afternoon on Sat 10 Oct 2026 in Sydney.
const NOW = new Date("2026-10-10T04:00:00Z");
const env = { ENCRYPTION_KEY: randomBytes(32).toString("base64"), NODE_ENV: "production" };
const options = { allowLocal: true, env, now: () => NOW };

let db: Db;
let close: () => Promise<void>;
let server: MockSimpleFin;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  server = await startMockSimpleFin();
  await db.insert(households).values({ id: ids.home, name: "Home" });
  const [o, p] = await db
    .insert(users)
    .values([
      { name: "Olive", email: "olive@example.com" },
      { name: "Pat", email: "pat@example.com" },
    ])
    .returning();
  await db.insert(members).values([
    { id: ids.olive, householdId: ids.home, userId: o.id, role: "owner", displayName: "Olive" },
    { id: ids.pat, householdId: ids.home, userId: p.id, role: "partner", displayName: "Pat" },
  ]);
});
afterAll(async () => {
  await server.close();
  await close();
});
beforeEach(() => {
  server.accountSet = FIXTURE;
  server.accountsStatus = null;
  server.requests = [];
});

/** A new connection for Olive, through the pretend server. */
async function connect(): Promise<string> {
  const result = await connectSimpleFin(db, olive, server.newToken(), options);
  if (!result.ok) throw new Error(result.error);
  return result.connectionId;
}

const picksFrom = (
  list: LiveAccount[],
  change: Partial<Record<string, Partial<AccountPick>>> = {},
) =>
  list.map((account) => ({
    externalId: account.externalId,
    include: account.included,
    isJoint: account.isJoint,
    visibility: account.visibility,
    ...change[account.externalId],
  }));

async function listed(connectionId: string) {
  const list = await listLiveAccounts(db, olive, connectionId, options);
  if (!list.ok) throw new Error(list.error);
  return list;
}

/** Picks every account but the term deposit, with the saver as balance only. */
async function pickMost(connectionId: string) {
  const list = await listed(connectionId);
  const saved = await saveAccountPicks(
    db,
    olive,
    connectionId,
    picksFrom(list.accounts, {
      "wcu-term": { include: false },
      "wcu-saver": { visibility: "balance_only" },
    }),
    options,
  );
  expect(saved).toEqual({ ok: true, picked: 5 });
}

async function rowsByAccount(connectionId: string) {
  const rows = await db
    .select({ externalId: accounts.externalId, transaction: transactions.externalId })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(eq(accounts.connectionId, connectionId));
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.externalId!] = (counts[row.externalId!] ?? 0) + 1;
  return { counts, total: rows.length, distinct: new Set(rows.map((r) => r.transaction)).size };
}

describe("first guesses", () => {
  it("guesses the kind of account from its name", () => {
    expect(guessKind("Everyday Access", 100)).toBe("everyday");
    expect(guessKind("Rewards Credit Card", -100)).toBe("credit");
    expect(guessKind("Visa Debit", 100)).toBe("everyday");
    expect(guessKind("Online Saver", 100)).toBe("savings");
    expect(guessKind("Term Deposit", 100)).toBe("savings");
    expect(guessKind("Home Loan", -100)).toBe("mortgage");
    expect(guessKind("Home Loan Offset", 100)).toBe("everyday");
    expect(guessKind("Car Loan", -100)).toBe("loan");
    expect(guessKind("Low Rate", -100)).toBe("credit");
    expect(guessKind("Spare", 100)).toBe("everyday");
  });

  it("takes an account as joint only when its name says so", () => {
    expect(guessJoint("Joint Everyday")).toBe(true);
    expect(guessJoint("Everyday Access")).toBe(false);
  });
});

describe("picking accounts", () => {
  it("lists every account behind the connection, with first guesses", async () => {
    const id = await connect();
    const list = await listed(id);
    expect(list.bankCount).toBe(2);
    expect(list.accounts.map((a) => [a.name, a.institution])).toEqual([
      ["Everyday Access", "Harbour Bank"],
      ["Rewards Credit Card", "Harbour Bank"],
      ["Joint Everyday", "Wattle Credit Union"],
      ["Online Saver", "Wattle Credit Union"],
      ["Home Loan", "Wattle Credit Union"],
      ["Term Deposit", "Wattle Credit Union"],
    ]);
    expect(list.accounts.every((a) => a.included && !a.saved)).toBe(true);
    expect(list.accounts.find((a) => a.name === "Joint Everyday")).toMatchObject({
      isJoint: true,
      visibility: "shared",
    });
    expect(list.accounts.find((a) => a.name === "Everyday Access")).toMatchObject({
      isJoint: false,
      visibility: "private",
      balanceCents: 218450,
    });
    expect(server.requests.at(-1)?.get("balances-only")).toBe("1");
  });

  it("shows a connection's accounts only to the member who connected it", async () => {
    const id = await connect();
    expect(await listLiveAccounts(db, pat, id, options)).toMatchObject({ ok: false });
    expect(await saveAccountPicks(db, pat, id, [], options)).toMatchObject({ ok: false });
  });

  it("needs at least one account ticked", async () => {
    const id = await connect();
    const list = await listed(id);
    const none = list.accounts.map((a) => ({ ...picksFrom([a])[0], include: false }));
    expect(await saveAccountPicks(db, olive, id, none, options)).toEqual({
      ok: false,
      error: "Tick at least one account.",
    });
    expect(await db.select().from(accounts).where(eq(accounts.connectionId, id))).toEqual([]);
  });

  it("saves the picks with the viewer as owner, and remembers them", async () => {
    const id = await connect();
    await pickMost(id);
    const saved = await db
      .select({
        externalId: accounts.externalId,
        owner: accounts.ownerMemberId,
        visibility: accounts.visibility,
        isJoint: accounts.isJoint,
        archived: accounts.archived,
        kind: accounts.kind,
      })
      .from(accounts)
      .where(eq(accounts.connectionId, id));
    expect(saved.every((a) => a.owner === ids.olive)).toBe(true);
    const by = Object.fromEntries(saved.map((a) => [a.externalId, a]));
    expect(by["wcu-joint"]).toMatchObject({ visibility: "shared", isJoint: true, archived: false });
    expect(by["wcu-saver"]).toMatchObject({ visibility: "balance_only", kind: "savings" });
    expect(by["hb-card"]).toMatchObject({ visibility: "private", kind: "credit" });
    expect(by["wcu-loan"]).toMatchObject({ kind: "mortgage" });
    expect(by["wcu-term"]).toMatchObject({ archived: true, visibility: "private" });

    const saving = await db
      .select({ balance: balances.balanceCents, date: balances.date })
      .from(balances)
      .innerJoin(accounts, eq(accounts.id, balances.accountId))
      .where(and(eq(accounts.connectionId, id), eq(accounts.externalId, "hb-card")));
    expect(saving).toEqual([{ balance: -128410, date: "2026-10-10" }]);

    const again = await listed(id);
    expect(again.accounts.find((a) => a.externalId === "wcu-term")).toMatchObject({
      included: false,
      saved: true,
    });
    expect(again.accounts.find((a) => a.externalId === "wcu-saver")).toMatchObject({
      included: true,
      visibility: "balance_only",
    });
  });

  it("says in plain words when the provider stops access", async () => {
    const id = await connect();
    server.accountsStatus = 403;
    expect(await listLiveAccounts(db, olive, id, options)).toMatchObject({
      ok: false,
      reconnect: true,
      error: "Your sync service stopped the app's access. Reconnect live sync.",
    });
    const [row] = await db.select().from(connections).where(eq(connections.id, id));
    expect(row.status).toBe("needs_reconnect");
  });
});

describe("the first sync", () => {
  it("brings in every ticked account's history, one account per request, with no duplicates", async () => {
    const id = await connect();
    await pickMost(id);
    server.requests = [];
    const run = await runFirstSync(db, olive, id, { ...options, budgetMs: 60_000 });
    expect(run).toMatchObject({ ran: true, finished: true, problem: false });

    const { counts, total, distinct } = await rowsByAccount(id);
    expect(counts).toEqual({ ...ROWS, "wcu-term": undefined });
    expect(total).toBe(distinct);

    const history = server.requests.filter((query) => !query.has("balances-only"));
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((query) => query.getAll("account").length === 1)).toBe(true);
    // Breadth first: every account's latest window comes in before anyone's older history.
    expect(history.slice(0, 5).map((q) => q.get("account"))).toEqual([
      "hb-everyday",
      "hb-card",
      "wcu-joint",
      "wcu-saver",
      "wcu-loan",
    ]);

    const progress = await firstSyncProgress(db, olive, id, NOW);
    expect(progress).toMatchObject({
      rows: 186,
      done: 5,
      finished: true,
      running: false,
      problem: null,
      bankCount: 2,
      today: "2026-10-10",
    });
    expect(progress!.accounts.map((a) => a.status)).toEqual(Array(5).fill("done"));
    expect(progress!.accounts[0].oldest).toBe("2026-05-13");

    const [connection] = await db.select().from(connections).where(eq(connections.id, id));
    expect(connection).toMatchObject({ status: "ok", lastSyncedAt: NOW, syncLeaseUntil: null });

    // A second run finds nothing to do and changes nothing.
    server.requests = [];
    expect(await runFirstSync(db, olive, id, options)).toMatchObject({
      windows: 0,
      finished: true,
    });
    expect(server.requests).toEqual([]);
    expect((await rowsByAccount(id)).total).toBe(186);
  });

  it("keeps the pending transaction marked as pending", async () => {
    const id = await connect();
    await pickMost(id);
    await runFirstSync(db, olive, id, { ...options, budgetMs: 60_000 });
    const [row] = await db
      .select({ pending: transactions.pending, date: transactions.date })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(and(eq(accounts.connectionId, id), eq(transactions.externalId, "ev-pending")));
    expect(row).toEqual({ pending: true, date: "2026-10-10" });
  });

  it("carries on where it stopped when it's interrupted", async () => {
    const id = await connect();
    await pickMost(id);
    // A budget of nothing does one window, as when the person leaves straight away.
    expect(await runFirstSync(db, olive, id, { ...options, budgetMs: 0 })).toMatchObject({
      windows: 1,
      finished: false,
    });
    let progress = await firstSyncProgress(db, olive, id, NOW);
    expect(progress!.accounts.map((a) => a.status)).toEqual([
      "busy",
      "waiting",
      "waiting",
      "waiting",
      "waiting",
    ]);
    expect(progress).toMatchObject({ finished: false, running: false });
    // The last 90 days: a row every other day (44) and today's pending one.
    expect(progress!.accounts[0]).toMatchObject({ rows: 45, historyFrom: "2026-07-13" });
    expect(await unfinishedFirstSyncs(db, olive)).toContain(id);

    // Six more: every account gets its latest 90 days, then the first two go further back.
    for (let i = 0; i < 6; i++) await runFirstSync(db, olive, id, { ...options, budgetMs: 0 });
    progress = await firstSyncProgress(db, olive, id, NOW);
    expect(progress!.accounts.map((a) => [a.status, a.historyFrom])).toEqual([
      ["busy", "2026-04-14"],
      ["busy", "2026-04-14"],
      ["busy", "2026-07-13"],
      ["busy", "2026-07-13"],
      ["busy", "2026-07-13"],
    ]);
    expect(progress!.finished).toBe(false);

    expect(await runFirstSync(db, olive, id, { ...options, budgetMs: 60_000 })).toMatchObject({
      finished: true,
    });
    const { total, distinct } = await rowsByAccount(id);
    expect(total).toBe(186);
    expect(distinct).toBe(186);
    expect(await unfinishedFirstSyncs(db, olive)).not.toContain(id);
  });

  it("never runs twice on one connection at the same time", async () => {
    const id = await connect();
    await pickMost(id);
    const lease = await claimSyncLease(db, olive, id, NOW);
    expect(lease).not.toBeNull();
    expect(await claimSyncLease(db, olive, id, NOW)).toBeNull();
    expect(await runFirstSync(db, olive, id, options)).toEqual({ ran: false });
    expect((await firstSyncProgress(db, olive, id, NOW))!.running).toBe(true);

    // A lease that's run out, from a sync that was cut off, can be taken over.
    const later = new Date(NOW.getTime() + 46_000);
    const run = await runFirstSync(db, olive, id, { ...options, now: () => later, budgetMs: 0 });
    expect(run).toMatchObject({ ran: true, windows: 1 });
  });

  it("stops with plain words when the provider fails, then carries on after", async () => {
    const id = await connect();
    await pickMost(id);
    await runFirstSync(db, olive, id, { ...options, budgetMs: 0 });
    server.accountsStatus = 402;
    expect(await runFirstSync(db, olive, id, options)).toMatchObject({ problem: true });
    const stopped = await firstSyncProgress(db, olive, id, NOW);
    expect(stopped!.problem).toEqual({
      reconnect: false,
      message: "Your sync service needs payment before it sends more. Check your plan there.",
    });
    expect(stopped!.running).toBe(false);
    expect(await unfinishedFirstSyncs(db, olive)).not.toContain(id);

    server.accountsStatus = 403;
    await runFirstSync(db, olive, id, options);
    expect((await firstSyncProgress(db, olive, id, NOW))!.problem?.reconnect).toBe(true);

    server.accountsStatus = null;
    expect(await runFirstSync(db, olive, id, { ...options, budgetMs: 60_000 })).toMatchObject({
      finished: true,
      problem: false,
    });
    expect((await firstSyncProgress(db, olive, id, NOW))!.problem).toBeNull();
    expect((await rowsByAccount(id)).total).toBe(186);
  });

  it("only works for the member who connected it", async () => {
    const id = await connect();
    await pickMost(id);
    expect(await runFirstSync(db, pat, id, options)).toEqual({ ran: false });
    expect(await firstSyncProgress(db, pat, id, NOW)).toBeNull();
    expect(await unfinishedFirstSyncs(db, pat)).toEqual([]);
  });

  it("brings in an account ticked later, and keeps history when one is left out", async () => {
    const id = await connect();
    await pickMost(id);
    await runFirstSync(db, olive, id, { ...options, budgetMs: 60_000 });

    let list = await listed(id);
    await saveAccountPicks(
      db,
      olive,
      id,
      picksFrom(list.accounts, { "wcu-term": { include: true }, "hb-card": { include: false } }),
      options,
    );
    const progress = await firstSyncProgress(db, olive, id, NOW);
    expect(progress!.accounts.map((a) => a.name)).not.toContain("Rewards Credit Card");
    expect(progress!.finished).toBe(false);
    expect(await runFirstSync(db, olive, id, { ...options, budgetMs: 60_000 })).toMatchObject({
      windows: 1,
      finished: true,
    });

    list = await listed(id);
    await saveAccountPicks(
      db,
      olive,
      id,
      picksFrom(list.accounts, { "hb-card": { include: true } }),
      options,
    );
    // Its history was already in, so nothing more is fetched.
    expect((await firstSyncProgress(db, olive, id, NOW))!.finished).toBe(true);
    expect((await rowsByAccount(id)).counts["hb-card"]).toBe(50);
  });
});
