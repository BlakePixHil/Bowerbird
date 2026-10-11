/**
 * Fill a local database with one made-up household for development: four accounts (one of them
 * joint), about 18 months of made-up transactions ending today (a little over 2,000 of them) and
 * a few budgets.
 * Today's and yesterday's card and everyday rows are still pending. Run with `pnpm db:seed:demo`.
 *
 * It refuses to run against anything but a database on this computer. Never run it against
 * production. Running it again replaces the demo household.
 */
import { loadEnvConfig } from "@next/env";
import { and, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { DEFAULT_TIMEZONE } from "../src/config/app";
import { closeDb, getDb } from "../src/lib/db/client";
import * as t from "../src/lib/db/schema";
import { addDays, addMonths, dayOfWeek, parts, todayIn } from "../src/lib/money/dates";
import { allocateCents } from "../src/lib/money/cents";
import { addStartingCategories, assignColours } from "../src/lib/sorting/categories";
import { nameShops } from "../src/lib/sorting/merchants";

loadEnvConfig(process.cwd());

const DEMO_EMAIL = "demo@example.com";
const DEMO_HOUSEHOLD = "Demo household";
const DAYS = 548;

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const host = new URL(url).hostname;
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  if (!local || process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error(
      `Refusing to seed demo data into ${host}. Demo data is for local databases only.`,
    );
  }
}

/** A small seeded random number generator, so the demo looks the same every run. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

type Row = {
  account: "everyday" | "savings" | "credit" | "joint";
  date: string;
  amountCents: number;
  description: string;
  category: string;
  transfer?: string;
  pending?: boolean;
  tag?: string;
};

function buildTransactions(start: string, end: string): Row[] {
  const random = mulberry32(20261010);
  const between = (min: number, max: number) => Math.round(min + random() * (max - min));
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  const rows: Row[] = [];

  const groceries = [
    "WOOLWORTHS 1234 SYDNEY AU",
    "COLES 0456 NEWTOWN NSW",
    "ALDI STORES 22 MARRICKVILLE",
  ];
  const eatingOut = [
    "CAFE BREVE SURRY HILLS",
    "SQ *LITTLE MARIONETTE",
    "UBER *EATS HELP.UBER.COM",
    "GUZMAN Y GOMEZ 088",
  ];
  const fuel = ["AMPOL ENFIELD 4471", "BP CONNECT ASHFIELD", "7-ELEVEN 2231 PETERSHAM"];
  const coffee = ["SINGLE O SURRY HILLS", "CAFE BREVE SURRY HILLS", "SQ *LITTLE MARIONETTE"];
  const lunch = ["SUSHI HUB TOWN HALL", "GUZMAN Y GOMEZ 088", "SQ *BAR LUCA", "MAMAK HAYMARKET"];
  const shopping = ["KMART 1077 BROADWAY", "BUNNINGS 545000 ALEXANDRIA", "JB HI FI 0312 SYDNEY"];

  for (let date = start; date <= end; date = addDays(date, 1)) {
    const weekday = dayOfWeek(date);
    const { day } = parts(date);

    // Paid fortnightly on Fridays, the same amount each time.
    if (weekday === 5 && Math.floor((Date.parse(date) / 86_400_000 - 1) / 7) % 2 === 0) {
      rows.push({
        account: "everyday",
        date,
        amountCents: 326000,
        description: "ACME PTY LTD SALARY",
        category: "Income",
      });
      const group = `save-${date}`;
      rows.push({
        account: "everyday",
        date,
        amountCents: -50000,
        description: "TRANSFER TO SAVINGS 0042",
        category: "Transfers",
        transfer: group,
      });
      rows.push({
        account: "savings",
        date,
        amountCents: 50000,
        description: "TRANSFER FROM EVERYDAY",
        category: "Transfers",
        transfer: group,
      });
      const joint = `joint-${date}`;
      rows.push({
        account: "everyday",
        date,
        amountCents: -140000,
        description: "TRANSFER TO JOINT 7731",
        category: "Transfers",
        transfer: joint,
      });
      rows.push({
        account: "joint",
        date,
        amountCents: 140000,
        description: "TRANSFER FROM EVERYDAY",
        category: "Transfers",
        transfer: joint,
      });
    }
    if (day === 1) {
      rows.push({
        account: "joint",
        date,
        amountCents: -225000,
        description: "RENT RAY WHITE REF 4417",
        category: "Housing",
      });
      rows.push({
        account: "savings",
        date,
        amountCents: between(380, 520),
        description: "INTEREST CREDIT",
        category: "Income",
      });
    }
    if (day === 3)
      rows.push({
        account: "credit",
        date,
        amountCents: -1899,
        description: "NETFLIX.COM MELBOURNE",
        category: "Subscriptions",
      });
    if (day === 9)
      rows.push({
        account: "credit",
        date,
        amountCents: -1399,
        description: "SPOTIFY P2A7C SYDNEY",
        category: "Subscriptions",
      });
    if (day === 12)
      rows.push({
        account: "everyday",
        date,
        amountCents: -8500,
        description: "TELSTRA DIRECT DEBIT",
        category: "Bills and utilities",
      });
    if (day === 15)
      rows.push({
        account: "everyday",
        date,
        amountCents: -9600,
        description: "NRMA INSURANCE 88213",
        category: "Insurance",
      });
    if (day === 20)
      rows.push({
        account: "joint",
        date,
        amountCents: -between(16000, 21000),
        description: "ORIGIN ENERGY 551023",
        category: "Bills and utilities",
      });

    if (weekday === 2 || weekday === 6) {
      rows.push({
        account: "joint",
        date,
        amountCents: -between(4000, 18000),
        description: pick(groceries),
        category: "Groceries",
      });
    }
    if (random() < 0.3) {
      rows.push({
        account: "everyday",
        date,
        amountCents: -between(800, 3500),
        description: "WOOLWORTHS METRO 2231",
        category: "Groceries",
      });
    }
    if (weekday >= 1 && weekday <= 5 && random() < 0.85) {
      rows.push({
        account: "everyday",
        date,
        amountCents: -between(450, 650),
        description: pick(coffee),
        category: "Eating out",
      });
    }
    if (weekday >= 1 && weekday <= 5 && random() < 0.4) {
      rows.push({
        account: "credit",
        date,
        amountCents: -between(1200, 2400),
        description: pick(lunch),
        category: "Eating out",
      });
    }
    if (random() < 0.1) {
      rows.push({
        account: "credit",
        date,
        amountCents: -between(1400, 4200),
        description: "UBER *TRIP HELP.UBER.COM",
        category: "Transport",
      });
    }
    if (random() < 0.45) {
      rows.push({
        account: "credit",
        date,
        amountCents: -between(600, 6000),
        description: pick(eatingOut),
        category: "Eating out",
      });
    }
    if (weekday === 0) {
      rows.push({
        account: "credit",
        date,
        amountCents: -between(5500, 9500),
        description: pick(fuel),
        category: "Fuel",
      });
    }
    for (const trip of [0.75, 0.6]) {
      if (weekday >= 1 && weekday <= 5 && random() < trip) {
        rows.push({
          account: "everyday",
          date,
          amountCents: -between(320, 980),
          description: "TRANSPORTFORNSW OPAL",
          category: "Transport",
        });
      }
    }
    if (random() < 0.15) {
      rows.push({
        account: "credit",
        date,
        amountCents: -between(1500, 15000),
        description: pick(shopping),
        category: "Shopping",
      });
    }
    if (random() < 0.04) {
      rows.push({
        account: "credit",
        date,
        amountCents: -between(1800, 6500),
        description: "PRICELINE PHARMACY 412",
        category: "Health",
      });
    }
    if (random() < 0.04) {
      rows.push({
        account: "credit",
        date,
        amountCents: -between(2200, 7000),
        description: "EVENT CINEMAS GEORGE ST",
        category: "Entertainment",
      });
    }
  }

  // Pay the credit card off on the 25th: money out of Everyday, money into the card.
  for (let month = addMonths(start, 0, 25); month <= end; month = addMonths(month, 1, 25)) {
    if (month < start) continue;
    const owed = rows
      .filter(
        (r) =>
          r.account === "credit" && !r.transfer && r.date < month && r.date >= addMonths(month, -1),
      )
      .reduce((sum, r) => sum + r.amountCents, 0);
    if (owed === 0) continue;
    const group = `card-${month}`;
    rows.push({
      account: "everyday",
      date: month,
      amountCents: owed,
      description: "CREDIT CARD PAYMENT 5521",
      category: "Transfers",
      transfer: group,
    });
    rows.push({
      account: "credit",
      date: month,
      amountCents: -owed,
      description: "PAYMENT THANK YOU",
      category: "Transfers",
      transfer: group,
    });
  }

  // A weekend away a month ago, tagged so search can find it.
  const away = addDays(end, -30);
  rows.push(
    {
      account: "joint",
      date: away,
      amountCents: -42000,
      description: "BOOKING.COM HOTEL KATOOMBA",
      category: "Travel",
      tag: "Weekend away",
    },
    {
      account: "credit",
      date: addDays(away, 1),
      amountCents: -6400,
      description: "BLUE MOUNTAINS FOOD CO",
      category: "Eating out",
      tag: "Weekend away",
    },
  );

  // The bank hasn't settled today's and yesterday's card and everyday spending yet.
  for (const row of rows) {
    if (row.date >= addDays(end, -1) && row.amountCents < 0 && !row.transfer)
      row.pending = row.account === "credit" || row.account === "everyday";
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  assertLocalDatabase();
  const db = getDb();
  const end = todayIn(DEFAULT_TIMEZONE);
  const start = addDays(end, -(DAYS - 1));

  await db.transaction(async (tx) => {
    // A split's parts hold on to their categories, so they go before the household does.
    const old = tx
      .select({ id: t.transactions.id })
      .from(t.transactions)
      .innerJoin(t.households, eq(t.households.id, t.transactions.householdId))
      .where(eq(t.households.name, DEMO_HOUSEHOLD));
    await tx.delete(t.splits).where(inArray(t.splits.transactionId, old));
    await tx.delete(t.households).where(eq(t.households.name, DEMO_HOUSEHOLD));
    await tx.delete(t.users).where(eq(t.users.email, DEMO_EMAIL));

    const [household] = await tx.insert(t.households).values({ name: DEMO_HOUSEHOLD }).returning();
    const [user] = await tx
      .insert(t.users)
      .values({ email: DEMO_EMAIL, name: "Alex Demo" })
      .returning();
    const [member] = await tx
      .insert(t.members)
      .values({ householdId: household.id, userId: user.id, role: "owner", displayName: "Alex" })
      .returning();

    await addStartingCategories(tx, household.id);
    const categoryRows = await tx
      .select()
      .from(t.categories)
      .where(eq(t.categories.householdId, household.id));
    const categoryId = new Map(categoryRows.map((c) => [c.name, c.id]));

    const accountRows = await tx
      .insert(t.accounts)
      .values([
        {
          householdId: household.id,
          ownerMemberId: member.id,
          name: "Everyday",
          kind: "everyday" as const,
          institution: "Demo Bank",
        },
        {
          householdId: household.id,
          ownerMemberId: member.id,
          name: "Savings",
          kind: "savings" as const,
          institution: "Demo Bank",
        },
        {
          householdId: household.id,
          ownerMemberId: member.id,
          name: "Credit card",
          kind: "credit" as const,
          institution: "Example Credit Union",
          includeInBudgets: true,
        },
        {
          householdId: household.id,
          ownerMemberId: member.id,
          name: "Joint",
          kind: "everyday" as const,
          institution: "Demo Bank",
          isJoint: true,
          visibility: "shared" as const,
        },
      ])
      .returning();
    const accountId = {
      everyday: accountRows[0].id,
      savings: accountRows[1].id,
      credit: accountRows[2].id,
      joint: accountRows[3].id,
    };

    const rows = buildTransactions(start, end);
    const groups = new Map<string, string>();
    const values = rows.map((row, index) => {
      let transferGroupId: string | undefined;
      if (row.transfer) {
        transferGroupId = groups.get(row.transfer) ?? crypto.randomUUID();
        groups.set(row.transfer, transferGroupId);
      }
      return {
        householdId: household.id,
        accountId: accountId[row.account],
        date: row.date,
        amountCents: row.amountCents,
        descriptionRaw: row.description,
        categoryId: categoryId.get(row.category),
        transferGroupId,
        pending: row.pending ?? false,
        source: "file" as const,
        dedupeKey: `demo:${index}`,
      };
    });
    const saved: { id: string }[] = [];
    for (let i = 0; i < values.length; i += 500) {
      saved.push(
        ...(await tx
          .insert(t.transactions)
          .values(values.slice(i, i + 500))
          .returning({ id: t.transactions.id })),
      );
    }
    // Shop names, the same way an import or sync names them.
    await nameShops(tx, { householdId: household.id, budgetMs: Infinity });
    // Rules for the usual shops, as if someone had said "Yes, always" to each. One is off.
    const usual = await tx
      .select({
        merchantId: t.transactions.merchantId,
        categoryId: t.transactions.categoryId,
        n: count(),
      })
      .from(t.transactions)
      .where(
        and(
          eq(t.transactions.householdId, household.id),
          isNotNull(t.transactions.merchantId),
          isNotNull(t.transactions.categoryId),
          isNull(t.transactions.transferGroupId),
        ),
      )
      .groupBy(t.transactions.merchantId, t.transactions.categoryId)
      .orderBy(desc(count()), t.transactions.merchantId);
    const ruled = new Map<string, (typeof usual)[number]>();
    for (const row of usual) if (!ruled.has(row.merchantId!)) ruled.set(row.merchantId!, row);
    await tx.insert(t.rules).values(
      [...ruled.values()].slice(0, 10).map((row, i) => ({
        householdId: household.id,
        merchantId: row.merchantId,
        categoryId: row.categoryId!,
        position: i,
        appliedCount: row.n,
        enabled: i !== 7,
      })),
    );
    const tagged = rows.flatMap((row, index) => (row.tag ? [{ row, id: saved[index].id }] : []));
    if (tagged.length > 0) {
      const [tag] = await tx
        .insert(t.tags)
        .values({ householdId: household.id, name: "Weekend away" })
        .returning();
      await tx
        .insert(t.transactionTags)
        .values(tagged.map(({ id }) => ({ transactionId: id, tagId: tag.id })));
    }

    // The newest Kmart shop is split: mostly groceries, the rest homewares.
    const kmart = rows
      .map((row, index) => ({ row, id: saved[index].id }))
      .filter(({ row }) => row.description.startsWith("KMART") && !row.pending)
      .at(-1);
    if (kmart && kmart.row.amountCents < -2_00) {
      const [groceries, homewares] = allocateCents(kmart.row.amountCents, [3, 2]);
      await tx.insert(t.splits).values([
        {
          transactionId: kmart.id,
          categoryId: categoryId.get("Groceries")!,
          amountCents: groceries,
        },
        {
          transactionId: kmart.id,
          categoryId: categoryId.get("Shopping")!,
          amountCents: homewares,
        },
      ]);
      await tx
        .update(t.transactions)
        .set({ categoryId: categoryId.get("Groceries")! })
        .where(eq(t.transactions.id, kmart.id));
    }

    // A balance for every account on every day, working forward from made-up opening balances.
    const opening = { everyday: 412000, savings: 1250000, credit: -84000, joint: 260000 };
    const balanceRows: (typeof t.balances.$inferInsert)[] = [];
    for (const account of ["everyday", "savings", "credit", "joint"] as const) {
      let balance = opening[account];
      for (let date = start; date <= end; date = addDays(date, 1)) {
        for (const row of rows)
          if (row.account === account && row.date === date && !row.pending)
            balance += row.amountCents;
        balanceRows.push({ accountId: accountId[account], date, balanceCents: balance });
      }
    }
    await tx.insert(t.balances).values(balanceRows);
    await assignColours(tx, household.id);

    // Alex's budgets: a mix of periods and kinds, some under and some over what they usually spend.
    // Set three months ago, so Health has something to roll over.
    const setOn = new Date(`${addMonths(end, -3, 1)}T02:00:00Z`);
    const budget = (
      category: string,
      amountCents: number,
      period: "weekly" | "monthly",
      kind: "set" | "flex" | "roll" = "flex",
    ) => ({
      householdId: household.id,
      ownerMemberId: member.id,
      categoryId: categoryId.get(category)!,
      amountCents,
      period,
      onSetDates: kind === "set",
      rollover: kind === "roll",
      alert80: kind !== "set",
      createdAt: setOn,
    });
    await tx
      .insert(t.budgets)
      .values([
        budget("Housing", 225_000, "monthly", "set"),
        budget("Groceries", 25_000, "weekly"),
        budget("Eating out", 60_000, "monthly"),
        budget("Fuel", 7_000, "weekly"),
        budget("Bills and utilities", 28_000, "monthly", "set"),
        budget("Shopping", 20_000, "monthly"),
        budget("Health", 6_000, "monthly", "roll"),
        budget("Subscriptions", 3_500, "monthly", "set"),
      ]);

    console.log(
      `Seeded "${DEMO_HOUSEHOLD}": 4 accounts, ${rows.length} transactions from ${start} to ${end}.`,
    );
  });
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
