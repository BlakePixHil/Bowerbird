/**
 * A pretend SimpleFIN server on this machine, for tests. It hands out setup tokens that work once,
 * checks the access link's user name and password, and answers GET /accounts with made-up data,
 * filtered the way the protocol says: by `account`, `start-date` and `end-date`, `pending` and
 * `balances-only`.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type MockAccountSet = Record<string, unknown>;

export type MockSimpleFin = {
  /** Base address, for example http://127.0.0.1:52011. */
  origin: string;
  /** A new setup token that works once. */
  newToken(): string;
  /** The access link the server gives for a claim. */
  accessUrl: string;
  /** What GET /accounts answers. Change it per test. */
  accountSet: MockAccountSet;
  /** Answer GET /accounts with this status instead, for example 402 or 500. */
  accountsStatus: number | null;
  /** The query of every GET /accounts, newest last. */
  requests: URLSearchParams[];
  /** How many claims were made, used or not. */
  claims: number;
  close(): Promise<void>;
};

const USER = "demo-user";
const PASS = "s3cret-pass";

export async function startMockSimpleFin(): Promise<MockSimpleFin> {
  const tokens = new Map<string, boolean>();
  let next = 0;
  const mock: MockSimpleFin = {
    origin: "",
    accessUrl: "",
    accountSet: { errlist: [], connections: [], accounts: [] },
    accountsStatus: null,
    requests: [],
    claims: 0,
    newToken() {
      const code = `claim-${++next}`;
      tokens.set(code, false);
      return Buffer.from(`${mock.origin}/simplefin/claim/${code}`).toString("base64");
    },
    close: () => new Promise((done) => server.close(() => done())),
  };

  function send(res: ServerResponse, status: number, body: string, type = "text/plain") {
    res.writeHead(status, { "content-type": type });
    res.end(body);
  }

  function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", mock.origin);
    const claim = /^\/simplefin\/claim\/([\w-]+)$/.exec(url.pathname);
    if (claim && req.method === "POST") {
      mock.claims++;
      const code = claim[1];
      if (!tokens.has(code) || tokens.get(code)) return send(res, 403, "Forbidden");
      tokens.set(code, true);
      return send(res, 200, mock.accessUrl);
    }
    if (url.pathname === "/simplefin/accounts" && req.method === "GET") {
      const expected = `Basic ${Buffer.from(`${USER}:${PASS}`).toString("base64")}`;
      if (req.headers.authorization !== expected) return send(res, 403, "Forbidden");
      mock.requests.push(url.searchParams);
      if (mock.accountsStatus) return send(res, mock.accountsStatus, "No");
      const body = JSON.stringify(filtered(mock.accountSet, url.searchParams));
      return send(res, 200, body, "application/json");
    }
    send(res, 404, "Not found");
  }

  const server = createServer(handle);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  mock.origin = `http://127.0.0.1:${port}`;
  mock.accessUrl = `http://${USER}:${PASS}@127.0.0.1:${port}/simplefin`;
  return mock;
}

type Row = Record<string, unknown>;

/** The account set as a SimpleFIN server would answer this query. */
function filtered(set: MockAccountSet, query: URLSearchParams): MockAccountSet {
  if (!Array.isArray(set.accounts)) return set;
  const wanted = query.getAll("account");
  const start = Number(query.get("start-date") ?? -Infinity);
  const end = Number(query.get("end-date") ?? Infinity);
  const pending = query.get("pending") === "1";
  const balancesOnly = query.get("balances-only") === "1";
  const accounts = (set.accounts as Row[])
    .filter((account) => wanted.length === 0 || wanted.includes(String(account.id)))
    .map((account) => {
      if (balancesOnly) return { ...account, transactions: undefined };
      if (!Array.isArray(account.transactions)) return account;
      const transactions = (account.transactions as Row[]).filter((row) => {
        if (row.pending === true && !pending) return false;
        const when = Number(row.posted) || Number(row.transacted_at);
        return !Number.isFinite(when) || (when >= start && when < end);
      });
      return { ...account, transactions };
    });
  return { ...set, accounts };
}
