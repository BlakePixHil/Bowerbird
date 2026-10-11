import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Viewer } from "@/lib/access";
import { LIVE_SYNC_PROVIDER as P } from "@/config/app";
import type { Db } from "@/lib/db";
import { connectionBanks, connections } from "@/lib/db/schema";
import { addMonths, daysBetween, formatShortDate, todayIn, type PlainDate } from "@/lib/money";
import type { SourceProblem } from "../source";

/**
 * Each bank behind a live sync connection. The provider can say one bank's connection needs
 * attention, such as a consent that ran out, while the others keep syncing. The provider doesn't
 * say when a consent ends, but its consents last a fixed time (`consentMonths`) from when they're
 * made, which is about when the bank first syncs here. So the app counts from then, and starts
 * warning `WARN_DAYS` before.
 */

/** Start warning this many days before a bank's consent should run out. */
export const WARN_DAYS = 14;

/**
 * Saves what a sync learned about each bank: banks whose accounts came in are working, and banks
 * the provider says need attention aren't. Banks it didn't hear about keep what they had. A bank's
 * consent is counted from the day it first syncs, and again from the day it syncs after its
 * consent should have ended (or after being reconnected near then), since it must have a new one.
 */
export async function saveBankStates(
  db: Db,
  connectionId: string,
  sent: { institution: string | null }[],
  problems: SourceProblem[],
  now: Date,
  timeZone: string,
) {
  const attention = new Set(
    problems.flatMap((problem) =>
      problem.kind === "reconnect" && problem.bank ? [problem.bank] : [],
    ),
  );
  const working = new Set(
    sent.flatMap((account) =>
      account.institution && !attention.has(account.institution) ? [account.institution] : [],
    ),
  );
  const target = [connectionBanks.connectionId, connectionBanks.name];

  if (attention.size > 0)
    await db
      .insert(connectionBanks)
      .values(
        [...attention].map((name) => ({
          connectionId,
          name,
          status: "needs_reconnect" as const,
          problemSince: now,
        })),
      )
      .onConflictDoUpdate({
        target,
        set: {
          status: "needs_reconnect",
          problemSince: sql`coalesce(${connectionBanks.problemSince}, excluded.problem_since)`,
        },
      });

  if (working.size > 0) {
    const ends = sql`(${connectionBanks.consentFrom} + make_interval(months => ${P.consentMonths}::int))::date`;
    await db
      .insert(connectionBanks)
      .values(
        [...working].map((name) => ({
          connectionId,
          name,
          status: "ok" as const,
          lastSyncedAt: now,
          consentFrom: todayIn(timeZone, now),
        })),
      )
      .onConflictDoUpdate({
        target,
        set: {
          status: "ok",
          lastSyncedAt: now,
          problemSince: null,
          consentFrom: sql`case
            when ${connectionBanks.consentFrom} is null
              or ${ends} <= excluded.consent_from
              or (${connectionBanks.status} = 'needs_reconnect'
                and ${ends} - ${WARN_DAYS}::int <= excluded.consent_from)
            then excluded.consent_from
            else ${connectionBanks.consentFrom} end`,
        },
      });
  }
}

export type BankHealth = {
  name: string;
  status: "ok" | "needs_reconnect";
  lastSyncedAt: Date | null;
  consentFrom: PlainDate | null;
  /** The day the bank's consent should run out, or null when it isn't known. */
  consentEnds: PlainDate | null;
};

export type ConnectionHealth = {
  id: string;
  /** The viewer connected it, so they're the one who can reconnect it. */
  mine: boolean;
  status: "ok" | "needs_reconnect" | "error";
  /** Why the last sync stopped, in plain words. */
  lastError: string | null;
  lastSyncedAt: Date | null;
  banks: BankHealth[];
};

/** Every live sync connection in the viewer's household, oldest first, with its banks by name. */
export async function liveHealth(db: Db, viewer: Viewer): Promise<ConnectionHealth[]> {
  const rows = await db
    .select({
      id: connections.id,
      memberId: connections.memberId,
      status: connections.status,
      lastError: connections.lastError,
      lastSyncedAt: connections.lastSyncedAt,
    })
    .from(connections)
    .where(eq(connections.householdId, viewer.householdId))
    .orderBy(asc(connections.createdAt), asc(connections.id));
  if (rows.length === 0) return [];
  const banks = await db
    .select({
      connectionId: connectionBanks.connectionId,
      name: connectionBanks.name,
      status: connectionBanks.status,
      lastSyncedAt: connectionBanks.lastSyncedAt,
      consentFrom: connectionBanks.consentFrom,
    })
    .from(connectionBanks)
    .where(
      inArray(
        connectionBanks.connectionId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(connectionBanks.name));
  return rows.map((row) => ({
    id: row.id,
    mine: row.memberId === viewer.memberId,
    status: row.status,
    lastError: row.lastError,
    lastSyncedAt: row.lastSyncedAt,
    banks: banks
      .filter((bank) => bank.connectionId === row.id)
      .map((bank) => ({
        name: bank.name,
        status: bank.status === "needs_reconnect" ? "needs_reconnect" : "ok",
        lastSyncedAt: bank.lastSyncedAt,
        consentFrom: bank.consentFrom,
        consentEnds: bank.consentFrom ? addMonths(bank.consentFrom, P.consentMonths) : null,
      })),
  }));
}

export type WarningAction =
  | { kind: "link"; label: string; href: string; external: boolean }
  | { kind: "sync"; label: string };

/** The banner on Home and Activity. */
export type SyncWarning = {
  /** The bold part, such as "Reconnect ANZ in Redbark." */
  title: string;
  /** What happened, and that nothing already here is lost. */
  body: string;
  action: WarningAction;
};

/** "ANZ", "ANZ and Westpac", "ANZ, Bendigo and Westpac", each name once. */
export function namesList(names: string[]): string {
  const once = [...new Set(names)];
  if (once.length <= 1) return once[0] ?? "";
  return `${once.slice(0, -1).join(", ")} and ${once.at(-1)}`;
}

const day = (date: PlainDate) => formatShortDate(date, { weekday: false });

function kept(at: Date | null, timeZone: string): string {
  return at
    ? `Everything up to ${day(todayIn(timeZone, at))} is still here.`
    : "Everything already here stays.";
}

const earliest = (dates: (Date | null)[]): Date | null =>
  dates.reduce<Date | null>((first, at) => (at && (!first || at < first) ? at : first), null);

const openProvider = (label: string): WarningAction => ({
  kind: "link",
  label,
  href: P.url,
  external: true,
});

/**
 * The one thing about live sync that most needs the viewer, or null when all is well. Only the
 * viewer's own connections count, since only the person who connected one can fix it. In order:
 * the whole connection stopped (it needs a new setup token), it failed for another reason, a bank
 * needs reconnecting at the provider, or a bank's consent ends within `WARN_DAYS`.
 */
export function syncWarning(
  health: ConnectionHealth[],
  today: PlainDate,
  timeZone: string,
): SyncWarning | null {
  const mine = health.filter((connection) => connection.mine);

  const cut = mine.find((connection) => connection.status === "needs_reconnect");
  if (cut)
    return {
      title: "Reconnect live sync.",
      body: `It needs a new setup token from ${P.name}. ${kept(cut.lastSyncedAt, timeZone)}`,
      action: {
        kind: "link",
        label: "Reconnect",
        href: `/connect?reconnect=${cut.id}`,
        external: false,
      },
    };

  const failed = mine.find((connection) => connection.status === "error");
  if (failed)
    return {
      title: "Live sync didn't work.",
      body: `${failed.lastError ?? "The next sync will try again."} ${kept(failed.lastSyncedAt, timeZone)}`,
      action: { kind: "sync", label: "Try again" },
    };

  // A bank that never synced here has been missing since its connection last synced.
  const banks = mine.flatMap((connection) =>
    connection.banks.map((bank) => ({
      ...bank,
      lastSyncedAt: bank.lastSyncedAt ?? connection.lastSyncedAt,
    })),
  );
  const stuck = banks.filter((bank) => bank.status === "needs_reconnect");
  if (stuck.length > 0) {
    const one = new Set(stuck.map((bank) => bank.name)).size === 1;
    const expired = stuck.every((bank) => bank.consentEnds !== null && bank.consentEnds <= today);
    const reason = expired
      ? one
        ? "The bank consent expired."
        : "The bank consents expired."
      : `${P.name} says ${one ? "it needs" : "they need"} attention.`;
    return {
      title: `Reconnect ${namesList(stuck.map((bank) => bank.name))} in ${P.name}.`,
      body: `${reason} ${kept(earliest(stuck.map((bank) => bank.lastSyncedAt)), timeZone)}`,
      action: openProvider("Reconnect"),
    };
  }

  const ending = banks.filter(
    (bank) => bank.consentEnds !== null && daysBetween(today, bank.consentEnds) <= WARN_DAYS,
  );
  if (ending.length > 0) {
    const first = ending.map((bank) => bank.consentEnds!).sort()[0];
    const when = first > today ? `ends around ${day(first)}` : `ended around ${day(first)}`;
    return {
      title: `Renew ${namesList(ending.map((bank) => bank.name))} in ${P.name} soon.`,
      body: `The bank consent ${when}. Renewing it keeps everything syncing.`,
      action: openProvider(`Open ${P.name}`),
    };
  }
  return null;
}

/** One bank's consent line on the Live bank sync card. */
export type ConsentLine = {
  text: string;
  /** Show it in the warning colour, with the warning icon. */
  warn: boolean;
  /** How much of the consent is left, from 0 to 1, or null to draw no bar. */
  left: number | null;
};

/**
 * "Consent lasts another 11 months", "Consent ends around 22 Oct" in the last `WARN_DAYS`,
 * "Consent expired 8 Oct" or "Needs reconnecting in Redbark".
 */
export function consentLine(bank: BankHealth, today: PlainDate): ConsentLine {
  const { consentFrom, consentEnds } = bank;
  if (bank.status === "needs_reconnect")
    return consentEnds && consentEnds <= today
      ? { text: `Consent expired ${day(consentEnds)}`, warn: true, left: 0 }
      : { text: `Needs reconnecting in ${P.name}`, warn: true, left: null };
  if (!consentFrom || !consentEnds) return { text: "Syncing", warn: false, left: null };
  const daysLeft = daysBetween(today, consentEnds);
  const left = Math.min(
    1,
    Math.max(0, daysLeft / Math.max(1, daysBetween(consentFrom, consentEnds))),
  );
  if (daysLeft <= 0)
    return { text: `Consent ended around ${day(consentEnds)}`, warn: true, left: 0 };
  if (daysLeft <= WARN_DAYS)
    return { text: `Consent ends around ${day(consentEnds)}`, warn: true, left };
  let months = 0;
  while (addMonths(today, months + 1) <= consentEnds) months++;
  const rest = months >= 2 ? `${months} months` : months === 1 ? "month" : `${daysLeft} days`;
  return { text: `Consent lasts another ${rest}`, warn: false, left };
}
