import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { asc, eq } from "drizzle-orm";
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
  claimLeaseForSync,
  firstSyncProgress,
  listLiveAccounts,
  runFirstSync,
  saveAccountPicks,
  syncConnection,
  syncDue,
  syncEverything,
  syncHousehold,
  syncIsDue,
} from ".";

const FIXTURE = JSON.parse(
  readFileSync(
    new URL("../../../../tests/fixtures/simplefin/household.json", import.meta.url),
    "utf8",
  ),
);
type Row = Record<string, unknown>;
type Account = Row & { id: string; transactions: Row[] };

// The first sync runs mid-afternoon on Sat 10 Oct 2026 in Sydney, and later syncs after it.
const NOW = new Date("2026-10-10T04:00:00Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const env = { ENCRYPTION_KEY: randomBytes(32).toString("base64"), NODE_ENV: "production" };
const base = { allowLocal: true, env };
const when = (time: Date) => ({ ...base, now: () => time });

let db: Db;
let close: () => Promise<void>;
let server: MockSimpleFin;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  server = await startMockSimpleFin();
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

/** The fixture with changes: each function gets a copy of one account to change. */
function bankWith(changes: Record<string, (account: Account) => void>) {
  const set = structuredClone(FIXTURE) as { accounts: Account[] };
  for (const account of set.accounts) changes[account.id]?.(account);
  return set;
}

/**
 * A household of its own with Olive (owner) and Pat (partner), and Olive's connection with every
 * account but the term deposit picked and its first sync finished.
 */
async function household() {
  const householdId = randomUUID();
  await db.insert(households).values({ id: householdId, name: "Home" });
  const [o, p] = await db
    .insert(users)
    .values([
      { name: "Olive", email: `olive-${householdId}@example.com` },
      { name: "Pat", email: `pat-${householdId}@example.com` },
    ])
    .returning();
  const [olive, pat] = await db
    .insert(members)
    .values([
      { householdId, userId: o.id, role: "owner" as const, displayName: "Olive" },
      { householdId, userId: p.id, role: "partner" as const, displayName: "Pat" },
    ])
    .returning();
  const owner: Viewer = { memberId: olive.id, householdId };
  const partner: Viewer = { memberId: pat.id, householdId };

  const connected = await connectSimpleFin(db, owner, server.newToken(), when(NOW));
  if (!connected.ok) throw new Error(connected.error);
  const connectionId = connected.connectionId;
  const list = await listLiveAccounts(db, owner, connectionId, when(NOW));
  if (!list.ok) throw new Error(list.error);
  await saveAccountPicks(
    db,
    owner,
    connectionId,
    list.accounts.map((account) => ({
      externalId: account.externalId,
      include: account.externalId !== "wcu-term",
      isJoint: account.isJoint,
      visibility: account.visibility,
    })),
    when(NOW),
  );
  const run = await runFirstSync(db, owner, connectionId, { ...when(NOW), budgetMs: 60_000 });
  expect(run).toMatchObject({ ran: true, finished: true });
  server.requests = [];
  return { owner, partner, connectionId };
}

/** Everything saved for a connection, to compare before and after a sync. */
async function saved(connectionId: string) {
  const rows = await db
    .select({
      id: transactions.id,
      account: accounts.externalId,
      externalId: transactions.externalId,
      date: transactions.date,
      amountCents: transactions.amountCents,
      description: transactions.descriptionRaw,
      pending: transactions.pending,
      note: transactions.note,
      updatedAt: transactions.updatedAt,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(eq(accounts.connectionId, connectionId))
    .orderBy(asc(transactions.id));
  const days = await db
    .select({ account: accounts.externalId, date: balances.date, cents: balances.balanceCents })
    .from(balances)
    .innerJoin(accounts, eq(accounts.id, balances.accountId))
    .where(eq(accounts.connectionId, connectionId))
    .orderBy(asc(accounts.externalId), asc(balances.date));
  return { rows, days };
}

const row = async (connectionId: string, externalId: string) =>
  (await saved(connectionId)).rows.find((r) => r.externalId === externalId);

async function connection(id: string) {
  const [found] = await db.select().from(connections).where(eq(connections.id, id));
  return found;
}

describe("the daily sync", () => {
  it("reads the last 30 days of every picked account in one request, and changes nothing twice", async () => {
    const { connectionId } = await household();
    const before = await saved(connectionId);
    expect(await syncConnection(db, connectionId, when(at(120)))).toBe("synced");
    expect(server.requests).toHaveLength(1);
    const query = server.requests[0];
    expect(query.getAll("account").sort()).toEqual(
      ["hb-card", "hb-everyday", "wcu-joint", "wcu-loan", "wcu-saver"].sort(),
    );
    expect(query.get("pending")).toBe("1");
    // 30 days ending today, asked a day early because the server's days are UTC.
    expect(Number(query.get("start-date"))).toBe(Date.parse("2026-09-10T00:00:00Z") / 1000);
    expect(await saved(connectionId)).toEqual(before);

    expect(await syncConnection(db, connectionId, when(at(180)))).toBe("synced");
    expect(await saved(connectionId)).toEqual(before);
    const after = await connection(connectionId);
    expect(after.lastSyncedAt).toEqual(at(180));
    expect(after.syncTriedAt).toEqual(at(180));
    expect(after.syncLeaseUntil).toBeNull();
  });

  it("updates a pending row in place when it posts under the same id", async () => {
    const { connectionId } = await household();
    const pending = await row(connectionId, "ev-pending");
    expect(pending).toMatchObject({ pending: true, amountCents: -650 });
    server.accountSet = bankWith({
      "hb-everyday": (account) => {
        const cart = account.transactions.find((t) => t.id === "ev-pending")!;
        Object.assign(cart, { pending: false, posted: 1791640000, description: "COFFEE CART SYD" });
      },
    });
    const count = (await saved(connectionId)).rows.length;
    await syncConnection(db, connectionId, when(at(120)));
    const after = await saved(connectionId);
    expect(after.rows).toHaveLength(count);
    expect(after.rows.find((r) => r.id === pending!.id)).toMatchObject({
      externalId: "ev-pending",
      pending: false,
      description: "COFFEE CART SYD",
      date: "2026-10-11",
    });
  });

  it("keeps the row, and anything added to it, when a pending row posts under a new id", async () => {
    const { connectionId } = await household();
    const pending = (await row(connectionId, "ev-pending"))!;
    await db
      .update(transactions)
      .set({ note: "Coffee with Sam" })
      .where(eq(transactions.id, pending.id));
    server.accountSet = bankWith({
      "hb-everyday": (account) => {
        account.transactions = account.transactions.filter((t) => t.id !== "ev-pending");
        account.transactions.push(
          // A different shop's row with the same amount, further away, isn't the one.
          { id: "ev-other", posted: 1792000000, amount: "-6.50", description: "BAKERY" },
          { id: "ev-posted", posted: 1791640000, amount: "-6.50", description: "COFFEE CART" },
        );
      },
    });
    const count = (await saved(connectionId)).rows.length;
    await syncConnection(db, connectionId, when(at(60 * 24 * 7)));
    const after = await saved(connectionId);
    expect(after.rows).toHaveLength(count + 1);
    expect(after.rows.find((r) => r.externalId === "ev-pending")).toBeUndefined();
    expect(after.rows.find((r) => r.id === pending.id)).toMatchObject({
      externalId: "ev-posted",
      pending: false,
      description: "COFFEE CART",
      note: "Coffee with Sam",
    });
    expect(after.rows.find((r) => r.externalId === "ev-other")).toBeDefined();
  });

  it("removes a pending row the bank stops sending, and brings in new rows and balances", async () => {
    const { connectionId } = await household();
    server.accountSet = bankWith({
      "hb-everyday": (account) => {
        account.transactions = account.transactions.filter((t) => t.id !== "ev-pending");
        account.transactions.push({
          id: "ev-new",
          posted: 1791680000,
          amount: "-42.00",
          description: "GROCER",
        });
        Object.assign(account, { balance: "2142.50", "balance-date": 1791680000 });
      },
    });
    const count = (await saved(connectionId)).rows.length;
    await syncConnection(db, connectionId, when(new Date("2026-10-11T03:00:00Z")));
    const after = await saved(connectionId);
    expect(after.rows).toHaveLength(count);
    expect(after.rows.find((r) => r.externalId === "ev-pending")).toBeUndefined();
    expect(after.rows.find((r) => r.externalId === "ev-new")).toMatchObject({
      date: "2026-10-11",
      amountCents: -4200,
      pending: false,
    });
    expect(after.days.filter((d) => d.account === "hb-everyday").slice(-2)).toEqual([
      { account: "hb-everyday", date: "2026-10-10", cents: 218450 },
      { account: "hb-everyday", date: "2026-10-11", cents: 214250 },
    ]);
  });

  it("never runs twice at once", async () => {
    const { connectionId } = await household();
    expect(await claimLeaseForSync(db, connectionId, at(120))).not.toBeNull();
    expect(await syncConnection(db, connectionId, when(at(120)))).toBe("busy");
    expect(server.requests).toHaveLength(0);
    // A lease left behind by a sync that died runs out.
    expect(await syncConnection(db, connectionId, when(at(121)))).toBe("synced");
  });

  it("saves a problem in plain words, keeps the data, and recovers", async () => {
    const { connectionId } = await household();
    const before = await saved(connectionId);
    server.accountsStatus = 403;
    expect(await syncConnection(db, connectionId, when(at(120)))).toBe("problem");
    expect(await connection(connectionId)).toMatchObject({
      status: "needs_reconnect",
      lastSyncedAt: NOW,
      syncTriedAt: at(120),
      syncLeaseUntil: null,
    });
    expect((await connection(connectionId)).lastError).toMatch(/Reconnect live sync/);
    expect(await saved(connectionId)).toEqual(before);
    server.accountsStatus = null;
    expect(await syncConnection(db, connectionId, when(at(180)))).toBe("synced");
    expect(await connection(connectionId)).toMatchObject({ status: "ok", lastError: null });
  });

  it("carries on a first sync that isn't finished", async () => {
    const { owner } = await household();
    const connected = await connectSimpleFin(db, owner, server.newToken(), when(NOW));
    if (!connected.ok) throw new Error(connected.error);
    const id = connected.connectionId;
    const list = await listLiveAccounts(db, owner, id, when(NOW));
    if (!list.ok) throw new Error(list.error);
    await saveAccountPicks(
      db,
      owner,
      id,
      list.accounts.map((a) => ({ ...a, include: a.externalId === "wcu-saver" })),
      when(NOW),
    );
    expect(await syncConnection(db, id, { ...when(NOW), budgetMs: 60_000 })).toBe("synced");
    expect((await firstSyncProgress(db, owner, id, NOW))?.finished).toBe(true);
  });
});

describe("when syncs run", () => {
  it("syncs on open at most once an hour, for anyone in the household", async () => {
    const { owner, partner, connectionId } = await household();
    expect(await syncIsDue(db, owner, at(30))).toBe(false);
    expect(await syncIsDue(db, owner, at(61))).toBe(true);
    expect(await syncIsDue(db, partner, at(61))).toBe(true);
    const stranger: Viewer = { memberId: partner.memberId, householdId: randomUUID() };
    expect(await syncIsDue(db, stranger, at(61))).toBe(false);
    expect(await syncDue(db, stranger, when(at(61)))).toMatchObject({ synced: 0 });

    expect(await syncDue(db, partner, when(at(61)))).toEqual({
      synced: 1,
      problems: 0,
      busy: 0,
      left: 0,
    });
    expect(await syncIsDue(db, owner, at(100))).toBe(false);

    // A failed sync counts as tried, so opening the app doesn't try again straight away.
    server.accountsStatus = 500;
    expect(await syncDue(db, owner, when(at(130)))).toMatchObject({ problems: 1 });
    expect((await connection(connectionId)).status).toBe("error");
    expect(await syncIsDue(db, owner, at(160))).toBe(false);
    expect(await syncIsDue(db, owner, at(191))).toBe(true);

    // Waiting on a reconnect: opening the app leaves it, but Sync now and the daily job try.
    server.accountsStatus = 403;
    await syncHousehold(db, owner, when(at(200)));
    expect((await connection(connectionId)).status).toBe("needs_reconnect");
    expect(await syncIsDue(db, owner, at(400))).toBe(false);
    server.accountsStatus = null;
    expect(await syncHousehold(db, partner, when(at(401)))).toMatchObject({ synced: 1 });
    expect((await connection(connectionId)).status).toBe("ok");
  });

  it("works through every household's connections inside the time budget", async () => {
    const first = await household();
    const second = await household();
    const result = await syncEverything(db, when(at(120)));
    expect(result.synced).toBeGreaterThanOrEqual(2);
    expect(result).toMatchObject({ problems: 0, busy: 0, left: 0 });
    for (const { connectionId } of [first, second])
      expect((await connection(connectionId)).lastSyncedAt).toEqual(at(120));
    expect(await syncEverything(db, { ...when(at(130)), budgetMs: 0 })).toMatchObject({
      synced: 0,
    });
  });

  it("skips connections with no accounts picked", async () => {
    const { owner } = await household();
    const connected = await connectSimpleFin(db, owner, server.newToken(), when(NOW));
    if (!connected.ok) throw new Error(connected.error);
    expect(await syncHousehold(db, owner, when(at(120)))).toMatchObject({ synced: 1 });
    expect((await connection(connected.connectionId)).syncTriedAt).toBeNull();
    expect(await syncConnection(db, connected.connectionId, when(at(130)))).toBe("skipped");
  });
});
