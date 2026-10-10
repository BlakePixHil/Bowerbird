import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import type { Db } from "@/lib/db";
import { accounts, balances, households, members, transactions, users } from "@/lib/db/schema";
import {
  balancesFor,
  scopeFor,
  transactionsFor,
  viewerOf,
  visibleAccounts,
  type View,
  type Viewer,
} from ".";

/**
 * One household: Olive (Owner) and Pat (Partner), each with a private, a balance-only and a
 * shared account, plus a joint account each connected. Olive's joint account is Shared; Pat set
 * theirs to Private. A second household has Zed, whose Shared account no one else may see.
 */
const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  away: "00000000-0000-4000-8000-000000000002",
  olive: "00000000-0000-4000-8000-0000000000a1",
  pat: "00000000-0000-4000-8000-0000000000a2",
  zed: "00000000-0000-4000-8000-0000000000a3",
};
const A = {
  olivePrivate: "00000000-0000-4000-8000-000000000b01",
  oliveBalanceOnly: "00000000-0000-4000-8000-000000000b02",
  oliveShared: "00000000-0000-4000-8000-000000000b03",
  jointShared: "00000000-0000-4000-8000-000000000b04",
  patPrivate: "00000000-0000-4000-8000-000000000b05",
  patBalanceOnly: "00000000-0000-4000-8000-000000000b06",
  patShared: "00000000-0000-4000-8000-000000000b07",
  jointPrivate: "00000000-0000-4000-8000-000000000b08",
  zedShared: "00000000-0000-4000-8000-000000000b09",
};
type Key = keyof typeof A;

const olive: Viewer = { memberId: ids.olive, householdId: ids.home };
const pat: Viewer = { memberId: ids.pat, householdId: ids.home };
const zed: Viewer = { memberId: ids.zed, householdId: ids.away };

/** Makes ids readable in failures. */
const name = Object.fromEntries(Object.entries(A).map(([key, id]) => [id, key as Key]));
const keys = (rows: { id?: string; accountId?: string }[]) =>
  [...new Set(rows.map((row) => name[(row.accountId ?? row.id)!]))].sort();

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(households).values([
    { id: ids.home, name: "Home" },
    { id: ids.away, name: "Away" },
  ]);
  const [o, p, z] = await db
    .insert(users)
    .values([
      { name: "Olive", email: "olive@example.com" },
      { name: "Pat", email: "pat@example.com" },
      { name: "Zed", email: "zed@example.com" },
    ])
    .returning();
  await db.insert(members).values([
    { id: ids.olive, householdId: ids.home, userId: o.id, role: "owner", displayName: "Olive" },
    { id: ids.pat, householdId: ids.home, userId: p.id, role: "partner", displayName: "Pat" },
    { id: ids.zed, householdId: ids.away, userId: z.id, role: "owner", displayName: "Zed" },
  ]);

  const account = (
    key: Key,
    owner: string,
    visibility: "shared" | "balance_only" | "private",
    isJoint = false,
    householdId = ids.home,
  ) => ({
    id: A[key],
    householdId,
    ownerMemberId: owner,
    name: `${key} account`,
    institution: `${key} bank`,
    visibility,
    isJoint,
  });
  await db
    .insert(accounts)
    .values([
      account("olivePrivate", ids.olive, "private"),
      account("oliveBalanceOnly", ids.olive, "balance_only"),
      account("oliveShared", ids.olive, "shared"),
      account("jointShared", ids.olive, "shared", true),
      account("patPrivate", ids.pat, "private"),
      account("patBalanceOnly", ids.pat, "balance_only"),
      account("patShared", ids.pat, "shared"),
      account("jointPrivate", ids.pat, "private", true),
      account("zedShared", ids.zed, "shared", false, ids.away),
    ]);

  const keyList = Object.keys(A) as Key[];
  // Two days of balances and one transaction on each of those days, for every account.
  await db.insert(balances).values(
    keyList.flatMap((key, i) => [
      { accountId: A[key], date: "2026-10-01", balanceCents: 100_00 + i },
      { accountId: A[key], date: "2026-10-08", balanceCents: 200_00 + i },
    ]),
  );
  await db.insert(transactions).values(
    keyList.flatMap((key) => [
      {
        householdId: key === "zedShared" ? ids.away : ids.home,
        accountId: A[key],
        date: "2026-10-01",
        amountCents: -12_50,
        descriptionRaw: `${key} coffee`,
        source: "file" as const,
      },
      {
        householdId: key === "zedShared" ? ids.away : ids.home,
        accountId: A[key],
        date: "2026-10-08",
        amountCents: -40_00,
        descriptionRaw: `${key} groceries`,
        source: "file" as const,
      },
    ]),
  );
});
afterAll(async () => close());

describe("visibleAccounts", () => {
  it("shows the Owner their own accounts in full, and the Partner's only as the Partner set them", async () => {
    const seen = await visibleAccounts(db, olive);
    const access = Object.fromEntries(seen.map((a) => [name[a.id], a.access]));
    expect(access).toEqual({
      olivePrivate: "full",
      oliveBalanceOnly: "full",
      oliveShared: "full",
      jointShared: "full",
      patPrivate: "hidden",
      patBalanceOnly: "balance_only",
      patShared: "full",
      jointPrivate: "hidden",
    });
  });

  it("works the same the other way round, whatever the role", async () => {
    const seen = await visibleAccounts(db, pat);
    const access = Object.fromEntries(seen.map((a) => [name[a.id], a.access]));
    expect(access).toEqual({
      olivePrivate: "hidden",
      oliveBalanceOnly: "balance_only",
      oliveShared: "full",
      jointShared: "full",
      patPrivate: "full",
      patBalanceOnly: "full",
      patShared: "full",
      jointPrivate: "full",
    });
  });

  it("says whose each account is: individual ones are their owner's, joint ones are Shared", async () => {
    const whose = Object.fromEntries(
      (await visibleAccounts(db, olive)).map((a) => [name[a.id], a.whose]),
    );
    expect(whose).toEqual({
      olivePrivate: "mine",
      oliveBalanceOnly: "mine",
      oliveShared: "mine",
      jointShared: "shared",
      patPrivate: "partner",
      patBalanceOnly: "partner",
      patShared: "partner",
      jointPrivate: "shared",
    });
  });

  it("never gives the name, bank or kind of a hidden account", async () => {
    const hidden = (await visibleAccounts(db, olive)).filter((a) => a.access === "hidden");
    expect(hidden).toHaveLength(2);
    for (const account of hidden) {
      expect(Object.keys(account).sort()).toEqual([
        "access",
        "id",
        "isJoint",
        "ownerMemberId",
        "whose",
      ]);
      expect(JSON.stringify(account)).not.toContain("bank");
    }
  });

  it("shows nothing from another household", async () => {
    expect(keys(await visibleAccounts(db, zed))).toEqual(["zedShared"]);
    // A member paired with a household they aren't in sees nothing at all.
    expect(await visibleAccounts(db, { memberId: ids.zed, householdId: ids.home })).toEqual([]);
    expect(await visibleAccounts(db, { memberId: ids.olive, householdId: ids.away })).toEqual([]);
  });

  it("builds the viewer from the signed-in member", () => {
    const me = { member: { id: ids.olive }, household: { id: ids.home } };
    expect(viewerOf(me)).toEqual(olive);
  });
});

describe("scopeFor", () => {
  async function scope(viewer: Viewer, view: View) {
    const { accounts: seen, hidden } = await scopeFor(db, viewer, view);
    return { accounts: keys(seen), hidden };
  }

  it("Mine is the viewer's own individual accounts", async () => {
    expect(await scope(olive, "mine")).toEqual({
      accounts: ["oliveBalanceOnly", "olivePrivate", "oliveShared"],
      hidden: 0,
    });
  });

  it("Partner's is what the partner lets the viewer see, and counts what's private", async () => {
    expect(await scope(olive, "partner")).toEqual({
      accounts: ["patBalanceOnly", "patShared"],
      hidden: 1,
    });
    expect(await scope(pat, "partner")).toEqual({
      accounts: ["oliveBalanceOnly", "oliveShared"],
      hidden: 1,
    });
  });

  it("Shared is the joint accounts", async () => {
    expect(await scope(olive, "shared")).toEqual({ accounts: ["jointShared"], hidden: 1 });
    // Pat connected the private joint account, so Pat sees it.
    expect(await scope(pat, "shared")).toEqual({
      accounts: ["jointPrivate", "jointShared"],
      hidden: 0,
    });
  });

  it("Household is everything the viewer can see", async () => {
    expect(await scope(olive, "household")).toEqual({
      accounts: [
        "jointShared",
        "oliveBalanceOnly",
        "olivePrivate",
        "oliveShared",
        "patBalanceOnly",
        "patShared",
      ],
      hidden: 2,
    });
  });
});

describe("the four views", () => {
  it("add up: Household is Mine plus Partner's plus Shared, with nothing counted twice", async () => {
    for (const viewer of [olive, pat]) {
      const parts = await Promise.all(
        (["mine", "partner", "shared"] as const).map((view) => scopeFor(db, viewer, view)),
      );
      const household = await scopeFor(db, viewer, "household");
      const ids = parts.flatMap((part) => part.accounts.map((account) => account.id));
      expect(new Set(ids).size).toBe(ids.length);
      expect([...ids].sort()).toEqual(household.accounts.map((account) => account.id).sort());
      expect(parts.reduce((sum, part) => sum + part.hidden, 0)).toBe(household.hidden);

      const total = async (view: View) =>
        (await transactionsFor(db, viewer, view)).reduce((sum, row) => sum + row.amountCents, 0);
      const split = (await total("mine")) + (await total("partner")) + (await total("shared"));
      expect(split).toBe(await total("household"));
    }
  });
});

describe("transactionsFor", () => {
  it("returns transactions only from accounts the viewer sees in full", async () => {
    expect(keys(await transactionsFor(db, olive, "household"))).toEqual([
      "jointShared",
      "oliveBalanceOnly",
      "olivePrivate",
      "oliveShared",
      "patShared",
    ]);
  });

  it("never returns transactions from a balance-only account, even when asked for it", async () => {
    expect(await transactionsFor(db, olive, "partner", { accountIds: [A.patBalanceOnly] })).toEqual(
      [],
    );
    expect(await transactionsFor(db, olive, "household", { accountIds: [A.patPrivate] })).toEqual(
      [],
    );
    expect(keys(await transactionsFor(db, olive, "partner"))).toEqual(["patShared"]);
  });

  it("keeps each view to its own accounts", async () => {
    expect(keys(await transactionsFor(db, olive, "mine"))).toEqual([
      "oliveBalanceOnly",
      "olivePrivate",
      "oliveShared",
    ]);
    expect(keys(await transactionsFor(db, pat, "shared"))).toEqual(["jointPrivate", "jointShared"]);
    expect(keys(await transactionsFor(db, pat, "partner"))).toEqual(["oliveShared"]);
    expect(keys(await transactionsFor(db, zed, "household"))).toEqual(["zedShared"]);
  });

  it("says whose account each came from, newest first", async () => {
    const rows = await transactionsFor(db, pat, "household", {
      accountIds: [A.jointShared, A.oliveShared],
    });
    expect(rows.map((row) => row.date)).toEqual([
      "2026-10-08",
      "2026-10-08",
      "2026-10-01",
      "2026-10-01",
    ]);
    expect(Object.fromEntries(rows.map((row) => [name[row.accountId], row.whose]))).toEqual({
      jointShared: "shared",
      oliveShared: "partner",
    });
  });

  it("filters by date and limits the count", async () => {
    const week = await transactionsFor(db, olive, "mine", { from: "2026-10-02", to: "2026-10-08" });
    expect(week.every((row) => row.date === "2026-10-08")).toBe(true);
    expect(week).toHaveLength(3);
    expect(await transactionsFor(db, olive, "mine", { limit: 2 })).toHaveLength(2);
    expect(await transactionsFor(db, olive, "mine", { to: "2026-09-30" })).toEqual([]);
  });
});

describe("balancesFor", () => {
  it("includes balance-only accounts but never hidden ones", async () => {
    expect(keys(await balancesFor(db, olive, "partner"))).toEqual(["patBalanceOnly", "patShared"]);
    expect(keys(await balancesFor(db, olive, "household"))).toEqual([
      "jointShared",
      "oliveBalanceOnly",
      "olivePrivate",
      "oliveShared",
      "patBalanceOnly",
      "patShared",
    ]);
    expect(keys(await balancesFor(db, pat, "mine"))).toEqual([
      "patBalanceOnly",
      "patPrivate",
      "patShared",
    ]);
  });

  it("filters by date, oldest first, and says whose each is", async () => {
    const rows = await balancesFor(db, olive, "household", { from: "2026-10-08" });
    expect(rows.every((row) => row.date === "2026-10-08")).toBe(true);
    expect(Object.fromEntries(rows.map((row) => [name[row.accountId], row.whose]))).toEqual({
      olivePrivate: "mine",
      oliveBalanceOnly: "mine",
      oliveShared: "mine",
      jointShared: "shared",
      patBalanceOnly: "partner",
      patShared: "partner",
    });
    const all = await balancesFor(db, olive, "mine");
    expect(all.map((row) => row.date)).toEqual([...all.map((row) => row.date)].sort());
  });

  it("gives nothing to a viewer outside the household", async () => {
    expect(
      await balancesFor(db, { memberId: ids.zed, householdId: ids.home }, "household"),
    ).toEqual([]);
  });
});
