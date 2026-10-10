import { todayIn, type PlainDate } from "@/lib/money";
import type { SourceTransaction } from "../source";

/**
 * Reading a SimpleFIN Account Set. Works with protocol version 1 (an `org` on each account and
 * `errors` as strings) and version 2 (`connections`, `conn_id` and `errlist`).
 */

export type SimpleFinAccount = {
  id: string;
  name: string;
  /** The bank's name, from the connection or org. */
  institution: string | null;
  /** The connection the account came through (version 2 only). */
  connectionId: string | null;
  currency: string;
  balanceCents: number;
  availableCents: number | null;
  balanceDate: PlainDate;
  /** Oldest first. */
  transactions: SourceTransaction[];
};

/** A message the server sent about a bank connection or account, such as a consent running out. */
export type SimpleFinProblem = {
  /** For example `con.auth` (version 2), or "" for a version 1 message. */
  code: string;
  message: string;
  connectionId: string | null;
  accountId: string | null;
};

export type AccountSet = {
  accounts: SimpleFinAccount[];
  problems: SimpleFinProblem[];
  /** Rows the server sent that couldn't be read (no id, or an amount that isn't a number). */
  skipped: number;
};

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const id = (value: unknown): string | null =>
  typeof value === "number" && Number.isFinite(value) ? String(value) : text(value);

/**
 * "-33293.43" as signed cents. More than two decimal places round half away from zero. Null when
 * it isn't a plain decimal number.
 */
export function decimalToCents(value: unknown): number | null {
  const raw = typeof value === "number" ? String(value) : value;
  if (typeof raw !== "string") return null;
  const match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(raw.trim());
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  const cents = Number(whole) * 100 + Number(fraction.slice(0, 2).padEnd(2, "0"));
  const rounded = cents + (Number(fraction[2] ?? "0") >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(rounded)) return null;
  return sign === "-" && rounded !== 0 ? -rounded : rounded;
}

/** A unix time in seconds as the day it falls on in the household's time zone. */
export function unixDay(seconds: number, timeZone: string): PlainDate {
  return todayIn(timeZone, new Date(seconds * 1000));
}

const seconds = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

function readTransaction(
  row: unknown,
  timeZone: string,
  today: PlainDate,
): SourceTransaction | null {
  if (!isObject(row)) return null;
  const externalId = id(row.id);
  const amountCents = decimalToCents(row.amount);
  if (!externalId || amountCents === null) return null;
  const pending = row.pending === true;
  // A pending transaction may have no posted time yet (0), so fall back to when it happened.
  const when = seconds(row.posted) ?? seconds(row.transacted_at);
  const description =
    text(row.description) ?? text(row.payee) ?? text(row.memo) ?? "No description";
  return {
    externalId,
    date: when === null ? today : unixDay(when, timeZone),
    amountCents,
    description,
    pending,
  };
}

/** Reads an Account Set, or returns null if it isn't one. */
export function readAccountSet(
  body: unknown,
  timeZone: string,
  now = new Date(),
): AccountSet | null {
  if (!isObject(body) || !Array.isArray(body.accounts)) return null;
  const today = todayIn(timeZone, now);
  const connections = new Map<string, string>();
  if (Array.isArray(body.connections)) {
    for (const c of body.connections) {
      const key = isObject(c) ? id(c.conn_id) : null;
      const name = isObject(c) ? (text(c.name) ?? text(c.org_url)) : null;
      if (key && name) connections.set(key, name);
    }
  }

  const problems: SimpleFinProblem[] = [];
  if (Array.isArray(body.errlist)) {
    for (const e of body.errlist) {
      if (!isObject(e)) continue;
      const message = text(e.msg);
      if (!message) continue;
      problems.push({
        code: text(e.code) ?? "",
        message,
        connectionId: id(e.conn_id),
        accountId: id(e.account_id),
      });
    }
  } else if (Array.isArray(body.errors)) {
    for (const e of body.errors) {
      const message = text(e);
      if (message) problems.push({ code: "", message, connectionId: null, accountId: null });
    }
  }

  let skipped = 0;
  const accounts: SimpleFinAccount[] = [];
  for (const a of body.accounts) {
    if (!isObject(a)) {
      skipped++;
      continue;
    }
    const accountId = id(a.id);
    const balanceCents = decimalToCents(a.balance);
    if (!accountId || balanceCents === null) {
      skipped++;
      continue;
    }
    const connectionId = id(a.conn_id);
    const org = isObject(a.org) ? a.org : null;
    const institution =
      (connectionId ? connections.get(connectionId) : undefined) ??
      (org ? (text(org.name) ?? text(org.domain)) : null);
    const transactions: SourceTransaction[] = [];
    if (Array.isArray(a.transactions)) {
      for (const row of a.transactions) {
        const transaction = readTransaction(row, timeZone, today);
        if (transaction) transactions.push(transaction);
        else skipped++;
      }
    }
    transactions.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    const currency = text(a.currency) ?? "AUD";
    const balanceAt = seconds(a["balance-date"]);
    accounts.push({
      id: accountId,
      name: text(a.name) ?? "Account",
      institution: institution ?? null,
      connectionId,
      currency: /^[a-z]{3}$/i.test(currency) ? currency.toUpperCase() : currency,
      balanceCents,
      availableCents: decimalToCents(a["available-balance"]),
      balanceDate: balanceAt === null ? today : unixDay(balanceAt, timeZone),
      transactions,
    });
  }
  return { accounts, problems, skipped };
}
