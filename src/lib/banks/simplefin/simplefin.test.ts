import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMockSimpleFin, type MockSimpleFin } from "../../../../tests/simplefin";
import { SourceError } from "../source";
import {
  checkSetupToken,
  claimSetupToken,
  decimalToCents,
  fetchAccountSet,
  isPrivateHost,
  readAccountSet,
  simplefinSource,
} from ".";

const TZ = "Australia/Sydney";
const at = (iso: string) => Date.parse(iso) / 1000;
const local = { allowLocal: true };

const ACCOUNT_SET = {
  errlist: [{ code: "con.auth", msg: "Westpac needs you to approve access again.", conn_id: "c1" }],
  connections: [
    { conn_id: "c1", name: "Westpac", org_id: "westpac", sfin_url: "https://example.test" },
    { conn_id: "c2", name: "ANZ", org_id: "anz", sfin_url: "https://example.test" },
  ],
  accounts: [
    {
      id: "acc-1",
      name: "Everyday",
      conn_id: "c1",
      currency: "AUD",
      balance: "2184.50",
      "available-balance": "2100.00",
      "balance-date": at("2026-09-03T05:00:00Z"),
      transactions: [
        // 1:30 am on 2 Sep in Sydney, though it's still 1 Sep in UTC.
        {
          id: "t2",
          posted: at("2026-09-01T15:30:00Z"),
          amount: "-4.50",
          description: "COFFEE CART",
        },
        {
          id: "t1",
          posted: at("2026-09-01T02:00:00Z"),
          amount: "-18.99",
          description: "NETFLIX.COM",
        },
        {
          id: "t3",
          posted: 0,
          transacted_at: at("2026-09-03T01:00:00Z"),
          amount: "-12.345",
          description: "PENDING SHOP",
          pending: true,
        },
        { id: "bad", posted: at("2026-09-01T02:00:00Z"), amount: "lots", description: "?" },
      ],
    },
    {
      id: "acc-2",
      name: "Joint",
      conn_id: "c2",
      currency: "aud",
      balance: "-1284",
      "balance-date": at("2026-09-03T05:00:00Z"),
    },
  ],
};

describe("setup tokens", () => {
  it("decodes a token to its claim link", () => {
    const token = Buffer.from("https://bridge.redbark.example/simplefin/claim/abc123").toString(
      "base64",
    );
    const check = checkSetupToken(`  ${token.slice(0, 20)}\n${token.slice(20)}  `);
    expect(check).toEqual({
      ok: true,
      claimUrl: "https://bridge.redbark.example/simplefin/claim/abc123",
      provider: "Redbark",
      last4: token.replace(/=+$/, "").slice(-4),
    });
    const other = Buffer.from("https://bridge.simplefin.org/simplefin/claim/demo").toString(
      "base64url",
    );
    expect(checkSetupToken(other)).toMatchObject({ ok: true, provider: "your sync service" });
  });

  it("refuses text that isn't a setup token", () => {
    for (const text of [
      "",
      "hello",
      "not base64 at all!!",
      Buffer.from("just some words here").toString("base64"),
      Buffer.from("ftp://files.example/x").toString("base64"),
    ]) {
      expect(checkSetupToken(text).ok).toBe(false);
    }
  });

  it("knows a private address when it sees one", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "10.1.2.3",
      "192.168.0.10",
      "172.20.1.1",
      "169.254.169.254",
      "[::1]",
      "[fd00::1]",
      "[::ffff:127.0.0.1]",
      "metadata",
      "router.local",
      "app.internal",
    ]) {
      expect(isPrivateHost(host)).toBe(true);
    }
    for (const host of ["bridge.simplefin.org", "redbark.com", "8.8.8.8", "[2606:4700::1111]"]) {
      expect(isPrivateHost(host)).toBe(false);
    }
  });
});

describe("reading SimpleFIN data", () => {
  it("reads amounts as cents without floating point", () => {
    expect(decimalToCents("-33293.43")).toBe(-3329343);
    expect(decimalToCents("100")).toBe(10000);
    expect(decimalToCents("0.5")).toBe(50);
    expect(decimalToCents("+12.345")).toBe(1235);
    expect(decimalToCents("-12.344")).toBe(-1234);
    expect(decimalToCents(19.99)).toBe(1999);
    expect(decimalToCents("1,000.00")).toBeNull();
    expect(decimalToCents("")).toBeNull();
    expect(decimalToCents(null)).toBeNull();
  });

  it("reads a version 2 account set in the household's time zone", () => {
    const set = readAccountSet(ACCOUNT_SET, TZ, new Date("2026-09-03T06:00:00Z"));
    expect(set?.skipped).toBe(1);
    expect(set?.problems).toEqual([
      {
        code: "con.auth",
        message: "Westpac needs you to approve access again.",
        connectionId: "c1",
        accountId: null,
      },
    ]);
    const [everyday, joint] = set!.accounts;
    expect(everyday).toMatchObject({
      id: "acc-1",
      name: "Everyday",
      institution: "Westpac",
      currency: "AUD",
      balanceCents: 218450,
      availableCents: 210000,
      balanceDate: "2026-09-03",
    });
    expect(everyday.transactions).toEqual([
      {
        externalId: "t1",
        date: "2026-09-01",
        amountCents: -1899,
        description: "NETFLIX.COM",
        pending: false,
      },
      {
        externalId: "t2",
        date: "2026-09-02",
        amountCents: -450,
        description: "COFFEE CART",
        pending: false,
      },
      {
        externalId: "t3",
        date: "2026-09-03",
        amountCents: -1235,
        description: "PENDING SHOP",
        pending: true,
      },
    ]);
    expect(joint).toMatchObject({
      institution: "ANZ",
      currency: "AUD",
      balanceCents: -128400,
      availableCents: null,
      transactions: [],
    });
  });

  it("reads a version 1 account set", () => {
    const set = readAccountSet(
      {
        errors: ["Connection to ANZ may need attention"],
        accounts: [
          {
            org: { domain: "anz.example", name: "ANZ" },
            id: 7,
            name: "Saver",
            currency: "AUD",
            balance: "10.00",
            "balance-date": at("2026-09-03T05:00:00Z"),
            transactions: [],
          },
        ],
      },
      TZ,
    );
    expect(set?.problems).toEqual([
      {
        code: "",
        message: "Connection to ANZ may need attention",
        connectionId: null,
        accountId: null,
      },
    ]);
    expect(set?.accounts[0]).toMatchObject({
      id: "7",
      institution: "ANZ",
      connectionId: null,
      balanceCents: 1000,
    });
  });

  it("refuses something that isn't an account set", () => {
    expect(readAccountSet(null, TZ)).toBeNull();
    expect(readAccountSet({ accounts: "no" }, TZ)).toBeNull();
    expect(readAccountSet([], TZ)).toBeNull();
  });
});

describe("talking to a SimpleFIN server", () => {
  let server: MockSimpleFin;
  beforeAll(async () => {
    server = await startMockSimpleFin();
  });
  afterAll(() => server.close());
  beforeEach(() => {
    server.accountSet = ACCOUNT_SET;
    server.accountsStatus = null;
    server.requests = [];
  });

  it("claims a setup token once", async () => {
    const token = server.newToken();
    const first = await claimSetupToken(token, local);
    expect(first).toEqual({ ok: true, accessUrl: server.accessUrl, provider: "your sync service" });
    const again = await claimSetupToken(token, local);
    expect(again).toMatchObject({ ok: false, problem: "used" });
    if (!again.ok) expect(again.error).toContain("already been used");
  });

  it("says when a token doesn't exist", async () => {
    const madeUp = Buffer.from(`${server.origin}/simplefin/claim/never-issued`).toString("base64");
    expect(await claimSetupToken(madeUp, local)).toMatchObject({ ok: false, problem: "used" });
  });

  it("refuses a bad token without contacting anyone", async () => {
    const before = server.claims;
    expect(await claimSetupToken("definitely not a token", local)).toMatchObject({
      ok: false,
      problem: "not_a_token",
    });
    expect(server.claims).toBe(before);
  });

  it("won't send a token to this machine or a private network", async () => {
    const before = server.claims;
    const result = await claimSetupToken(server.newToken());
    expect(result).toMatchObject({ ok: false, problem: "not_a_token" });
    expect(server.claims).toBe(before);
  });

  it("says when the server can't be reached", async () => {
    const nowhere = Buffer.from("http://127.0.0.1:1/simplefin/claim/x").toString("base64");
    expect(await claimSetupToken(nowhere, local)).toMatchObject({ ok: false, problem: "network" });
  });

  it("reads accounts with the access link's name and password", async () => {
    const set = await fetchAccountSet(server.accessUrl, { balancesOnly: true }, TZ, local);
    expect(set.accounts.map((a) => a.name)).toEqual(["Everyday", "Joint"]);
    expect(server.requests.at(-1)?.get("balances-only")).toBe("1");
  });

  it("turns failures into plain words", async () => {
    const wrong = server.accessUrl.replace("s3cret-pass", "wrong");
    await expect(fetchAccountSet(wrong, {}, TZ, local)).rejects.toMatchObject({ kind: "auth" });
    server.accountsStatus = 402;
    await expect(fetchAccountSet(server.accessUrl, {}, TZ, local)).rejects.toMatchObject({
      kind: "payment",
    });
    server.accountsStatus = 500;
    await expect(fetchAccountSet(server.accessUrl, {}, TZ, local)).rejects.toMatchObject({
      kind: "network",
    });
    server.accountsStatus = null;
    server.accountSet = { nothing: true };
    await expect(fetchAccountSet(server.accessUrl, {}, TZ, local)).rejects.toMatchObject({
      kind: "bad_response",
    });
    try {
      await fetchAccountSet(wrong, {}, TZ, local);
    } catch (error) {
      expect(error).toBeInstanceOf(SourceError);
      expect(String(error)).not.toContain("wrong");
      expect(String(error)).not.toContain("127.0.0.1");
    }
  });

  it("works as a BankSource", async () => {
    const source = simplefinSource(server.accessUrl, TZ, local);
    const accounts = await source.listAccounts();
    expect(accounts[0]).toEqual({
      externalId: "acc-1",
      name: "Everyday",
      institution: "Westpac",
      currency: "AUD",
      balanceCents: 218450,
      availableCents: 210000,
      date: "2026-09-03",
    });
    const rows = await source.fetchTransactions("acc-1", "2026-09-02", "2026-09-03");
    expect(rows.map((r) => r.externalId)).toEqual(["t2", "t3"]);
    const query = server.requests.at(-1)!;
    expect(query.get("account")).toBe("acc-1");
    expect(query.get("pending")).toBe("1");
    expect(Number(query.get("start-date"))).toBe(at("2026-09-01T00:00:00Z"));
    expect(Number(query.get("end-date"))).toBe(at("2026-09-05T00:00:00Z"));
    expect(await source.fetchBalance("acc-2")).toEqual({
      balanceCents: -128400,
      availableCents: null,
      date: "2026-09-03",
    });
    await expect(source.fetchBalance("gone")).rejects.toMatchObject({ kind: "auth" });
  });
});
