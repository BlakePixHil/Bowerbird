import { and, asc, eq, max, sql, sum } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { accounts, balances, households, transactions } from "@/lib/db/schema";
import { addDays, todayIn, type PlainDate } from "@/lib/money";

/**
 * Daily balances: one row per account per day, from its first transaction to today, so net worth
 * history and Until payday have something to draw from. Balances the bank or a file gives are
 * kept as they are. Every other day is worked out from the nearest given balance and the posted
 * transactions in between: forward from the one before it (carrying it forward), or back from
 * the first one for days before it (backfilling). Pending rows don't count, since they haven't
 * moved the balance yet.
 */

export type DayBalance = { date: PlainDate; balanceCents: number };

/** Rows per insert, well inside Postgres's limit on query parameters. */
const CHUNK = 1000;

/**
 * The balance at the end of every day from `start` to `end`. `given` are the balances a bank or
 * file stated, oldest first; `moves` is each day's total of posted transactions. Empty when
 * nothing was ever given, since there's nothing to work from.
 */
export function dailyBalances(
  start: PlainDate,
  end: PlainDate,
  given: DayBalance[],
  moves: Map<PlainDate, number>,
): (DayBalance & { workedOut: boolean })[] {
  if (given.length === 0 || start > end) return [];
  const stated = new Map(given.map((day) => [day.date, day.balanceCents]));
  const first = given[0];
  const out: (DayBalance & { workedOut: boolean })[] = [];

  // Back from the first given balance: each day ends where the next began.
  let balance = first.balanceCents;
  const before: (DayBalance & { workedOut: boolean })[] = [];
  for (let day = first.date; day > start;) {
    balance -= moves.get(day) ?? 0;
    day = addDays(day, -1);
    if (day <= end) before.push({ date: day, balanceCents: balance, workedOut: true });
  }
  out.push(...before.reverse());

  // Forward from it: a given balance replaces the worked-out one, and carries on from there.
  balance = first.balanceCents;
  for (let day = first.date; day <= end; day = addDays(day, 1)) {
    if (day !== first.date) balance += moves.get(day) ?? 0;
    const given = stated.get(day);
    if (given !== undefined) balance = given;
    if (day >= start)
      out.push({ date: day, balanceCents: balance, workedOut: given === undefined });
  }
  return out;
}

/**
 * Saves balances the bank or a file gave, one per day. Each replaces whatever its day had, worked
 * out or given.
 */
export async function saveGivenBalances(db: Db, accountId: string, days: DayBalance[]) {
  for (let i = 0; i < days.length; i += CHUNK) {
    await db
      .insert(balances)
      .values(
        days.slice(i, i + CHUNK).map((day) => ({
          accountId,
          date: day.date,
          balanceCents: day.balanceCents,
          workedOut: false,
        })),
      )
      .onConflictDoUpdate({
        target: [balances.accountId, balances.date],
        set: { balanceCents: sql`excluded.balance_cents`, workedOut: false },
        setWhere: sql`${balances.balanceCents} <> excluded.balance_cents or ${balances.workedOut}`,
      });
  }
}

/** Saves the balance the bank gave for a day. */
export const saveGivenBalance = (db: Db, accountId: string, day: DayBalance) =>
  saveGivenBalances(db, accountId, [{ date: day.date, balanceCents: day.balanceCents }]);

/**
 * Works out and saves the account's balance for every day from its first transaction (or first
 * given balance, if earlier) to today in its household's time zone, leaving given balances as
 * they are. Run it after anything that adds, changes or removes the account's rows or balances.
 * Returns how many days it saved or changed.
 */
export async function fillBalances(db: Db, accountId: string, now = new Date()): Promise<number> {
  const [account] = await db
    .select({ timeZone: households.timezone })
    .from(accounts)
    .innerJoin(households, eq(households.id, accounts.householdId))
    .where(eq(accounts.id, accountId));
  if (!account) return 0;

  const given = await db
    .select({ date: balances.date, balanceCents: balances.balanceCents })
    .from(balances)
    .where(and(eq(balances.accountId, accountId), eq(balances.workedOut, false)))
    .orderBy(asc(balances.date));
  if (given.length === 0) return 0;
  const days = await db
    .select({ date: transactions.date, total: sum(transactions.amountCents).mapWith(Number) })
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), eq(transactions.pending, false)))
    .groupBy(transactions.date)
    .orderBy(asc(transactions.date));
  const moves = new Map(days.map((day) => [day.date, day.total]));

  const start = days[0] && days[0].date < given[0].date ? days[0].date : given[0].date;
  const today = todayIn(account.timeZone, now);
  const end = given.at(-1)!.date > today ? given.at(-1)!.date : today;
  const workedOut = dailyBalances(start, end, given, moves).filter((day) => day.workedOut);

  let saved = 0;
  for (let i = 0; i < workedOut.length; i += CHUNK) {
    const rows = await db
      .insert(balances)
      .values(
        workedOut.slice(i, i + CHUNK).map((day) => ({
          accountId,
          date: day.date,
          balanceCents: day.balanceCents,
          workedOut: true,
        })),
      )
      // Only replaces a worked-out day, and only when it's changed.
      .onConflictDoUpdate({
        target: [balances.accountId, balances.date],
        set: { balanceCents: sql`excluded.balance_cents` },
        setWhere: sql`${balances.workedOut} and ${balances.balanceCents} <> excluded.balance_cents`,
      })
      .returning({ id: balances.id });
    saved += rows.length;
  }
  return saved;
}

/**
 * The daily job's part: carries every account's balance forward to today, for accounts nothing
 * updated today, such as file-only ones or one the bank didn't send. Stops starting new accounts
 * once the time budget is used; the rest catch up next time.
 */
export async function carryBalancesForward(
  db: Db,
  options: { now?: () => Date; budgetMs?: number } = {},
): Promise<{ accounts: number; left: number }> {
  const clock = options.now ?? (() => new Date());
  const startedAt = clock().getTime();
  const budget = options.budgetMs ?? 10_000;
  const behind = await db
    .select({ id: accounts.id, timeZone: households.timezone, latest: max(balances.date) })
    .from(accounts)
    .innerJoin(households, eq(households.id, accounts.householdId))
    .innerJoin(balances, eq(balances.accountId, accounts.id))
    .where(eq(accounts.archived, false))
    .groupBy(accounts.id, households.timezone)
    .orderBy(asc(sql`max(${balances.date})`), asc(accounts.id));
  const now = clock();
  const due = behind.filter(
    (row) => row.latest !== null && row.latest < todayIn(row.timeZone, now),
  );
  let done = 0;
  for (const row of due) {
    if (clock().getTime() - startedAt >= budget) break;
    await fillBalances(db, row.id, now);
    done++;
  }
  return { accounts: done, left: due.length - done };
}
