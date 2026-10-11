import { addDays, type PlainDate } from "@/lib/money";
import {
  SourceError,
  type BankSource,
  type SourceAccount,
  type SourceAccountList,
} from "../source";
import {
  readText,
  remoteUrl,
  safeRequest,
  TooBigError,
  UnsafeUrlError,
  type HttpOptions,
} from "./http";
import { readAccountSet, type AccountSet, type SimpleFinAccount } from "./parse";
import { checkSetupToken, providerName } from "./token";

/**
 * Talking to a SimpleFIN server: claiming a setup token once, then reading accounts with the
 * access link it gives back. Nothing here logs or returns a token or link in an error.
 */

const CLAIM_TIMEOUT_MS = 15_000;
const ACCOUNTS_TIMEOUT_MS = 25_000;
const MAX_ACCESS_URL_BYTES = 4 * 1024;
const MAX_ACCOUNT_SET_BYTES = 20 * 1024 * 1024;

const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/** Why a claim failed, so the screen can say what to do next. */
export type ClaimProblem =
  /** Not a setup token at all. */
  | "not_a_token"
  /** The server says the token was already claimed, or never existed. */
  | "used"
  /** Couldn't reach the server, or it timed out. */
  | "network"
  /** The server answered, but not with an access link. */
  | "bad_response";

export type ClaimResult =
  | { ok: true; accessUrl: string; provider: string }
  | { ok: false; problem: ClaimProblem; error: string };

function claimFailed(problem: ClaimProblem, error: string): ClaimResult {
  return { ok: false, problem, error };
}

/**
 * Trades a setup token for an access link. A token works once: after a successful claim, the
 * access link is the only way back in, so save it straight away.
 */
export async function claimSetupToken(
  setupToken: string,
  options: HttpOptions = {},
): Promise<ClaimResult> {
  const check = checkSetupToken(setupToken);
  if (!check.ok) return claimFailed("not_a_token", check.error);
  const who = check.provider;
  let claimUrl: URL;
  try {
    claimUrl = remoteUrl(check.claimUrl, options);
  } catch {
    return claimFailed("not_a_token", check.provider === "Redbark" ? NOT_REDBARK : NOT_SAFE);
  }

  let response: Response;
  let body: string;
  try {
    response = await safeRequest(
      claimUrl,
      { method: "POST", body: "", timeoutMs: CLAIM_TIMEOUT_MS },
      options,
    );
    body = await readText(response, MAX_ACCESS_URL_BYTES);
  } catch (error) {
    if (error instanceof UnsafeUrlError || error instanceof TooBigError)
      return claimFailed("bad_response", badClaim(who));
    return claimFailed(
      "network",
      `Couldn't reach ${who} just now. Check your internet connection and try again in a minute.`,
    );
  }

  if (response.status === 403)
    return claimFailed(
      "used",
      `This setup token has already been used. Make a new one in ${who} and paste that. If you didn't use it here, cut its access in ${who}.`,
    );
  if (!response.ok)
    return claimFailed(
      "bad_response",
      `${capital(who)} couldn't take the setup token (error ${response.status}). Try again in a minute.`,
    );

  const accessUrl = body.trim();
  try {
    const url = remoteUrl(accessUrl, options);
    if (!url.username || !url.password) throw new UnsafeUrlError();
  } catch {
    return claimFailed("bad_response", badClaim(who));
  }
  return { ok: true, accessUrl, provider: who };
}

const NOT_SAFE =
  "This setup token points somewhere the app won't connect to. Copy the token from your sync service again.";
const NOT_REDBARK =
  "This setup token points somewhere the app won't connect to. Copy the token from Redbark again.";

const badClaim = (who: string) =>
  `${capital(who)} sent back something that isn't an access link. Make a new setup token and try again.`;

/** Options for one read of the accounts. Dates are unix seconds, as the protocol has them. */
export type AccountQuery = {
  startDate?: number;
  endDate?: number;
  pending?: boolean;
  balancesOnly?: boolean;
  accounts?: string[];
};

/** The access link without its user name and password, plus the header that carries them. */
function splitAccessUrl(accessUrl: string, options: HttpOptions): { base: URL; auth: string } {
  const url = remoteUrl(accessUrl, options);
  if (!url.username || !url.password) throw new UnsafeUrlError();
  const auth = Buffer.from(
    `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`,
  ).toString("base64");
  url.username = "";
  url.password = "";
  return { base: url, auth: `Basic ${auth}` };
}

/**
 * Reads the Account Set behind an access link. Throws SourceError with a plain message: `auth` when
 * access was cut (reconnect), `payment` when the provider wants paying, `network` or
 * `bad_response` otherwise.
 */
export async function fetchAccountSet(
  accessUrl: string,
  query: AccountQuery,
  timeZone: string,
  options: HttpOptions = {},
): Promise<AccountSet> {
  let who = "your sync service";
  let base: URL;
  let auth: string;
  try {
    ({ base, auth } = splitAccessUrl(accessUrl, options));
    who = providerName(base);
  } catch {
    throw new SourceError("auth", "The saved access link can't be used. Reconnect live sync.");
  }

  const url = new URL(base.href.replace(/\/+$/, "") + "/accounts");
  if (query.startDate !== undefined) url.searchParams.set("start-date", String(query.startDate));
  if (query.endDate !== undefined) url.searchParams.set("end-date", String(query.endDate));
  if (query.pending) url.searchParams.set("pending", "1");
  if (query.balancesOnly) url.searchParams.set("balances-only", "1");
  for (const account of query.accounts ?? []) url.searchParams.append("account", account);

  let response: Response;
  let body: string;
  try {
    response = await safeRequest(
      url,
      {
        method: "GET",
        headers: { authorization: auth, accept: "application/json" },
        timeoutMs: ACCOUNTS_TIMEOUT_MS,
      },
      options,
    );
    body = await readText(response, MAX_ACCOUNT_SET_BYTES);
  } catch (error) {
    if (error instanceof TooBigError)
      throw new SourceError(
        "bad_response",
        `${capital(who)} sent more than the app can read at once.`,
      );
    if (error instanceof UnsafeUrlError)
      throw new SourceError("bad_response", `${capital(who)} sent the app somewhere it won't go.`);
    throw new SourceError(
      "network",
      `Couldn't reach ${who} just now. The next sync will try again.`,
    );
  }

  if (response.status === 401 || response.status === 403)
    throw new SourceError("auth", `${capital(who)} stopped the app's access. Reconnect live sync.`);
  if (response.status === 402)
    throw new SourceError(
      "payment",
      `${capital(who)} needs payment before it sends more. Check your plan there.`,
    );
  if (!response.ok)
    throw new SourceError(
      "network",
      `${capital(who)} had a problem (error ${response.status}). The next sync will try again.`,
    );

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }
  const set = readAccountSet(json, timeZone);
  if (!set) throw new SourceError("bad_response", `${capital(who)} sent data the app can't read.`);
  return set;
}

const asSourceAccount = (a: SimpleFinAccount): SourceAccount => ({
  externalId: a.id,
  name: a.name,
  institution: a.institution,
  currency: a.currency,
  balanceCents: a.balanceCents,
  availableCents: a.availableCents,
  date: a.balanceDate,
});

/** Midnight UTC at the start of a day, in unix seconds. */
const unixStart = (date: PlainDate) => Date.parse(`${date}T00:00:00Z`) / 1000;

/** A SimpleFIN connection as a BankSource. Dates are worked out in the household's time zone. */
export function simplefinSource(
  accessUrl: string,
  timeZone: string,
  options: HttpOptions = {},
): BankSource {
  const accounts = async (): Promise<SourceAccountList> => {
    const set = await fetchAccountSet(accessUrl, { balancesOnly: true }, timeZone, options);
    return { accounts: set.accounts.map(asSourceAccount), bankCount: set.bankCount };
  };
  // Ask a day either side, since the server's days are UTC, then keep the household's days.
  const between = (wanted: string[], from: PlainDate, to?: PlainDate) =>
    fetchAccountSet(
      accessUrl,
      {
        startDate: unixStart(addDays(from, -1)),
        endDate: to ? unixStart(addDays(to, 2)) : undefined,
        pending: true,
        accounts: wanted,
      },
      timeZone,
      options,
    );
  const inDays = (rows: SimpleFinAccount["transactions"], from: PlainDate, to?: PlainDate) =>
    rows.filter((t) => t.date >= from && (!to || t.date <= to));
  return {
    listAccounts: accounts,
    async fetchTransactions(account, from, to) {
      const set = await between([account], from, to);
      const found = set.accounts.find((a) => a.id === account);
      return inDays(found?.transactions ?? [], from, to);
    },
    async fetchRecent(wanted, from) {
      if (wanted.length === 0) return { accounts: [] };
      const set = await between(wanted, from);
      return {
        accounts: set.accounts
          .filter((a) => wanted.includes(a.id))
          .map((a) => ({ ...asSourceAccount(a), transactions: inDays(a.transactions, from) })),
      };
    },
    async fetchBalance(account) {
      const found = (await accounts()).accounts.find((a) => a.externalId === account);
      if (!found)
        throw new SourceError(
          "auth",
          "That account isn't shared with the app any more. Reconnect live sync.",
        );
      return {
        balanceCents: found.balanceCents,
        availableCents: found.availableCents,
        date: found.date,
      };
    },
  };
}
