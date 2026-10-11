/**
 * The phase 1 data model from 02 · Architecture in Linear.
 *
 * - Money is signed integer cents (negative is money out). Never floats.
 * - Bank dates are plain `date` strings (YYYY-MM-DD). Other times are timestamptz.
 * - Every row belongs to a household, directly or through its parent. Users are the one exception.
 * - Read transactions and balances only through `src/lib/access` (BUD-13).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { DEFAULT_TIMEZONE } from "@/config/app";

const id = () => uuid().primaryKey().defaultRandom();
const cents = (name?: string) =>
  name ? bigint(name, { mode: "number" }) : bigint({ mode: "number" });
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// Enums ---------------------------------------------------------------------

export const memberRole = pgEnum("member_role", ["owner", "partner"]);
export const connectionKind = pgEnum("connection_kind", ["simplefin", "coinspot"]);
export const connectionStatus = pgEnum("connection_status", ["ok", "needs_reconnect", "error"]);
export const accountKind = pgEnum("account_kind", [
  "everyday",
  "savings",
  "credit",
  "loan",
  "mortgage",
  "investment",
  "crypto",
  "super",
  "property",
  "other",
]);
export const accountVisibility = pgEnum("account_visibility", [
  "shared",
  "balance_only",
  "private",
]);
export const transactionSource = pgEnum("transaction_source", ["sync", "file"]);
export const categoryKind = pgEnum("category_kind", ["spending", "income", "transfer"]);
export const fileFormat = pgEnum("file_format", ["csv", "ofx", "qif"]);
export const budgetScope = pgEnum("budget_scope", ["household", "personal"]);
/** How often a budget runs. See 04 · Budgets and paydays for what each one means. */
export const budgetPeriod = pgEnum("budget_period", [
  "weekly",
  "fortnightly",
  "twice_monthly",
  "four_weekly",
  "monthly",
  "quarterly",
  "yearly",
  "custom",
]);
/**
 * How a person's new budgets run, from "How should budgets run?": calendar months, from one
 * payday to the next, or Monday to Sunday.
 */
export const budgetsRun = pgEnum("budgets_run", ["monthly", "payday", "weekly"]);
/** How often an income arrives. */
export const payFrequency = pgEnum("pay_frequency", [
  "weekly",
  "fortnightly",
  "twice_monthly",
  "four_weekly",
  "monthly",
]);

// People and sign-in --------------------------------------------------------

export const households = pgTable("households", {
  id: id(),
  name: text().notNull(),
  timezone: text().notNull().default(DEFAULT_TIMEZONE),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text().notNull(),
    name: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_key").on(sql`lower(${t.email})`)],
);

export const members = pgTable(
  "members",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole().notNull(),
    displayName: text().notNull(),
    /** The period new budgets start with. Each budget can still have its own. */
    budgetsRun: budgetsRun().notNull().default("monthly"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("members_household_user_key").on(t.householdId, t.userId)],
);

export const passkeys = pgTable(
  "passkeys",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** base64url credential id from the authenticator. */
    credentialId: text().notNull(),
    publicKey: text().notNull(),
    counter: bigint({ mode: "number" }).notNull().default(0),
    transports: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** A friendly label such as "iPhone", shown in settings. */
    label: text(),
    createdAt: createdAt(),
    lastUsedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("passkeys_credential_id_key").on(t.credentialId),
    index("passkeys_user_idx").on(t.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the random session token in the cookie. The token itself is never stored. */
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const emailLinks = pgTable(
  "email_links",
  {
    id: id(),
    email: text().notNull(),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("email_links_token_hash_key").on(t.tokenHash),
    index("email_links_email_idx").on(sql`lower(${t.email})`, t.createdAt),
  ],
);

// Banks and accounts --------------------------------------------------------

export const connections = pgTable(
  "connections",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    memberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    kind: connectionKind().notNull(),
    /** AES-256-GCM ciphertext (src/lib/crypto). Never log it or send it to the browser. */
    secretEncrypted: text().notNull(),
    status: connectionStatus().notNull().default("ok"),
    lastSyncedAt: timestamp({ withTimezone: true }),
    lastError: text(),
    consentExpiresAt: timestamp({ withTimezone: true }),
    /** How many bank connections the provider has behind this link, for the plan usage line. */
    bankCount: smallint(),
    /** A sync holds this lease while it runs, so the same connection never syncs twice at once. */
    syncLeaseUntil: timestamp({ withTimezone: true }),
    /** When a sync last started, whether it worked or not. Opening the app syncs at most hourly. */
    syncTriedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("connections_member_idx").on(t.memberId)],
);

/**
 * Each bank behind a live sync connection, as the provider names it. One bank's consent can run
 * out while the others keep syncing, so each bank keeps its own state.
 */
export const connectionBanks = pgTable(
  "connection_banks",
  {
    id: id(),
    connectionId: uuid()
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    /** The bank's name as the provider gives it. Only ever shown as the person's own data. */
    name: text().notNull(),
    /** ok, or needs_reconnect while the provider says this bank's connection needs attention. */
    status: connectionStatus().notNull().default("ok"),
    /** When this bank's accounts last came in without a problem. */
    lastSyncedAt: timestamp({ withTimezone: true }),
    /** When the provider first said this bank needs attention. Cleared once it works again. */
    problemSince: timestamp({ withTimezone: true }),
    /**
     * The first day of the bank's current consent, as near as the app can tell: the day it first
     * synced here, or synced again after being reconnected. Null until it has synced.
     */
    consentFrom: date({ mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("connection_banks_connection_name_key").on(t.connectionId, t.name)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    ownerMemberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    /** Null for accounts that only get file imports or are entered by hand. */
    connectionId: uuid().references(() => connections.id, { onDelete: "set null" }),
    /** The source's id for this account, when it has one. */
    externalId: text(),
    /** Bank or provider name, from the user's own data only. */
    institution: text(),
    name: text().notNull(),
    kind: accountKind().notNull().default("everyday"),
    isJoint: boolean().notNull().default(false),
    visibility: accountVisibility().notNull().default("private"),
    includeInBudgets: boolean().notNull().default(true),
    manual: boolean().notNull().default(false),
    archived: boolean().notNull().default(false),
    /** Live sync only: the earliest day the first sync has asked the bank for so far. */
    historyFrom: date({ mode: "string" }),
    /** Live sync only: when the first sync finished bringing in this account's history. */
    historySyncedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("accounts_household_idx").on(t.householdId),
    uniqueIndex("accounts_connection_external_key")
      .on(t.connectionId, t.externalId)
      .where(sql`${t.connectionId} is not null and ${t.externalId} is not null`),
  ],
);

/** One balance per account per day. */
export const balances = pgTable(
  "balances",
  {
    id: id(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    balanceCents: cents().notNull(),
    /**
     * Worked out from another day's balance and the transactions in between, rather than given by
     * the bank or a file. A given balance always replaces a worked-out one, never the other way.
     */
    workedOut: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("balances_account_date_key").on(t.accountId, t.date)],
);

// Sorting -------------------------------------------------------------------

export const merchants = pgTable(
  "merchants",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Normalised bank text, for example "WOOLWORTHS". */
    matchText: text().notNull(),
    /** What people see, for example "Woolworths". */
    displayName: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("merchants_household_match_key").on(t.householdId, t.matchText)],
);

export const categories = pgTable(
  "categories",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text().notNull(),
    kind: categoryKind().notNull().default("spending"),
    /** Icon name from the inline icon set. */
    icon: text(),
    /** 1 to 7 maps to --c1 to --c7. Null means the shared grey. */
    colourSlot: smallint(),
    /** True when someone chose the colour by hand, so automatic assignment leaves it alone. */
    colourPinned: boolean().notNull().default(false),
    countsTowardBudgets: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    archived: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("categories_household_idx").on(t.householdId)],
);

export const tags = pgTable(
  "tags",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tags_household_name_key").on(t.householdId, sql`lower(${t.name})`)],
);

export const rules = pgTable(
  "rules",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** A rule matches a shop, or failing that some text in the description. */
    merchantId: uuid().references(() => merchants.id, { onDelete: "cascade" }),
    matchText: text(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    tagId: uuid().references(() => tags.id, { onDelete: "set null" }),
    enabled: boolean().notNull().default(true),
    /** Lower runs first. The first enabled match wins. */
    position: integer().notNull().default(0),
    appliedCount: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("rules_household_idx").on(t.householdId, t.position),
    // One rule per shop, so "Yes, always" twice updates the rule rather than adding another.
    uniqueIndex("rules_household_merchant_key")
      .on(t.householdId, t.merchantId)
      .where(sql`${t.merchantId} is not null`),
  ],
);

// Transactions --------------------------------------------------------------

export const imports = pgTable(
  "imports",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    memberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    filename: text().notNull(),
    format: fileFormat().notNull(),
    rows: integer().notNull().default(0),
    imported: integer().notNull().default(0),
    skipped: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("imports_account_idx").on(t.accountId)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** The source's transaction id. Set for synced rows, and for file rows that carry one. */
    externalId: text(),
    /** The bank's date, as a plain date. */
    date: date({ mode: "string" }).notNull(),
    /** Signed cents. Negative is money out. */
    amountCents: cents().notNull(),
    descriptionRaw: text().notNull(),
    merchantId: uuid().references(() => merchants.id, { onDelete: "set null" }),
    categoryId: uuid().references(() => categories.id, { onDelete: "set null" }),
    pending: boolean().notNull().default(false),
    /** Both sides of a transfer between the household's own accounts share this id. */
    transferGroupId: uuid(),
    note: text(),
    source: transactionSource().notNull(),
    importId: uuid().references(() => imports.id, { onDelete: "set null" }),
    /** Date, amount and normalised description. Set for file rows so re-imports are skipped. */
    dedupeKey: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("transactions_account_external_key")
      .on(t.accountId, t.externalId)
      .where(sql`${t.externalId} is not null`),
    uniqueIndex("transactions_account_dedupe_key")
      .on(t.accountId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
    index("transactions_account_date_idx").on(t.accountId, t.date.desc()),
    index("transactions_household_date_idx").on(t.householdId, t.date.desc()),
    index("transactions_category_idx").on(t.categoryId),
    index("transactions_merchant_idx").on(t.merchantId),
    index("transactions_transfer_group_idx")
      .on(t.transferGroupId)
      .where(sql`${t.transferGroupId} is not null`),
  ],
);

export const splits = pgTable(
  "splits",
  {
    id: id(),
    transactionId: uuid()
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    amountCents: cents().notNull(),
  },
  (t) => [index("splits_transaction_idx").on(t.transactionId)],
);

export const transactionTags = pgTable(
  "transaction_tags",
  {
    transactionId: uuid()
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.transactionId, t.tagId] }),
    index("transaction_tags_tag_idx").on(t.tagId),
  ],
);

// Budgets and paydays -------------------------------------------------------

export const incomes = pgTable(
  "incomes",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    memberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    label: text().notNull(),
    amountCents: cents().notNull(),
    accountId: uuid().references(() => accounts.id, { onDelete: "set null" }),
    frequency: payFrequency().notNull(),
    /**
     * A known payday. Weekly, fortnightly and four-weekly count from it; monthly and twice-monthly
     * use its day of the month, so it's kept in a month that has that day (31 is the last day).
     */
    anchorDate: date({ mode: "string" }).notNull(),
    /** The second day of the month for twice-monthly pay (the first comes from anchorDate). */
    secondDay: smallint(),
    createdAt: createdAt(),
  },
  (t) => [index("incomes_member_idx").on(t.memberId)],
);

export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    scope: budgetScope().notNull().default("personal"),
    ownerMemberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    /** The limit for one period, in cents. */
    amountCents: cents().notNull(),
    period: budgetPeriod().notNull().default("monthly"),
    /**
     * Where periods count from: the start weekday (weekly), a payday (fortnightly), the first of
     * the two days (twice monthly), a start date (four-weekly, custom), the start day (monthly;
     * null means calendar months), or the year's first day (yearly; 1 July for the financial year).
     */
    periodAnchor: date({ mode: "string" }),
    /** The last day of a custom period. */
    periodEnd: date({ mode: "string" }),
    /** The second day of the month for twice-monthly budgets. */
    periodSecondDay: smallint(),
    rollover: boolean().notNull().default(false),
    /**
     * Comes out on set dates, like a bill, so it counts in full on its day rather than building up
     * across the period. The "Set date" kind on Change the plan; rollover is the "Rolls over" one.
     */
    onSetDates: boolean().notNull().default(false),
    alert80: boolean("alert_80").notNull().default(true),
    alert100: boolean("alert_100").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("budgets_household_idx").on(t.householdId),
    index("budgets_category_idx").on(t.categoryId),
    // One budget per category for each person, and one for the household.
    uniqueIndex("budgets_personal_category_key")
      .on(t.ownerMemberId, t.categoryId)
      .where(sql`${t.scope} = 'personal'`),
    uniqueIndex("budgets_household_category_key")
      .on(t.householdId, t.categoryId)
      .where(sql`${t.scope} = 'household'`),
  ],
);

export const savedViews = pgTable(
  "saved_views",
  {
    id: id(),
    memberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    name: text().notNull(),
    /** Activity's search and filters, as `SavedFilters` in `src/lib/access/find.ts`. */
    filters: jsonb().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("saved_views_member_name_key").on(t.memberId, sql`lower(${t.name})`)],
);
