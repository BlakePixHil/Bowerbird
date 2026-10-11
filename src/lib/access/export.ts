import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  accounts,
  balances,
  budgets,
  categories,
  members,
  merchants,
  splits,
  tags,
  transactions,
  transactionTags,
} from "@/lib/db/schema";
import type { PlainDate } from "@/lib/money";
import { otherMembers, visibleAccounts, type SeenAccount, type Viewer } from "./accounts";
import { paydaysOf, type Income } from "./incomes";
import { ruleList, type RuleRow } from "./rules";

/** An account in the export: one the viewer sees in full or as a balance only. */
export type ExportAccount = SeenAccount & {
  /** Whose it is, by name: null for the viewer's own and joint ones. */
  ownerName: string | null;
  live: boolean;
};

export type ExportTransaction = {
  id: string;
  date: PlainDate;
  accountId: string;
  description: string;
  shop: string | null;
  amountCents: number;
  categoryId: string | null;
  pending: boolean;
  transfer: boolean;
  note: string | null;
  source: "sync" | "file";
  tags: string[];
};

export type ExportSplit = { transactionId: string; categoryId: string; amountCents: number };

export type ExportCategory = Pick<
  typeof categories.$inferSelect,
  "id" | "name" | "kind" | "countsTowardBudgets" | "archived" | "colourSlot"
>;

export type ExportBudget = Pick<
  typeof budgets.$inferSelect,
  | "id"
  | "categoryId"
  | "scope"
  | "amountCents"
  | "period"
  | "periodAnchor"
  | "periodEnd"
  | "periodSecondDay"
  | "rollover"
  | "onSetDates"
  | "alert80"
  | "alert100"
>;

export type ExportBalance = {
  accountId: string;
  date: PlainDate;
  balanceCents: number;
  workedOut: boolean;
};

/** Everything one member may see, for Export everything. */
export type ExportData = {
  accounts: ExportAccount[];
  transactions: ExportTransaction[];
  splits: ExportSplit[];
  categories: ExportCategory[];
  rules: RuleRow[];
  budgets: ExportBudget[];
  incomes: Income[];
  balances: ExportBalance[];
};

/**
 * Everything the viewer is allowed to see, by the same rules as the app: accounts they see in
 * full or as a balance only (a partner's private ones aren't even named), transactions with their
 * split parts, tags and notes from accounts they see in full only, balances from both, the
 * household's categories, the rules they can see, their own and the household's budgets, and
 * their own pay. Oldest first, so it reads in order in a spreadsheet.
 */
export async function exportData(db: Db, viewer: Viewer): Promise<ExportData> {
  // Someone who isn't in the household gets nothing at all.
  if (!(await isMember(db, viewer))) {
    return {
      accounts: [],
      transactions: [],
      splits: [],
      categories: [],
      rules: [],
      budgets: [],
      incomes: [],
      balances: [],
    };
  }
  const [all, others] = await Promise.all([visibleAccounts(db, viewer), otherMembers(db, viewer)]);
  const seen = all.filter((account): account is SeenAccount => account.access !== "hidden");

  const names = new Map(others.map((member) => [member.id, member.name]));
  const seenIds = seen.map((account) => account.id);
  const fullIds = seen.filter((account) => account.access === "full").map((a) => a.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const inFull = inArray(transactions.accountId, fullIds.length ? fullIds : none);

  const [live, rows, parts, tagRows, categoryRows, ruleRows, budgetRows, pay, balanceRows] =
    await Promise.all([
      seenIds.length
        ? db
            .select({ id: accounts.id, connectionId: accounts.connectionId })
            .from(accounts)
            .where(inArray(accounts.id, seenIds))
        : [],
      db
        .select({
          id: transactions.id,
          date: transactions.date,
          accountId: transactions.accountId,
          description: transactions.descriptionRaw,
          shop: merchants.displayName,
          amountCents: transactions.amountCents,
          categoryId: transactions.categoryId,
          pending: transactions.pending,
          transferGroupId: transactions.transferGroupId,
          note: transactions.note,
          source: transactions.source,
        })
        .from(transactions)
        .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
        .where(and(eq(transactions.householdId, viewer.householdId), inFull))
        .orderBy(asc(transactions.date), asc(transactions.createdAt), asc(transactions.id)),
      db
        .select({
          transactionId: splits.transactionId,
          categoryId: splits.categoryId,
          amountCents: splits.amountCents,
        })
        .from(splits)
        .innerJoin(transactions, eq(transactions.id, splits.transactionId))
        .where(and(eq(transactions.householdId, viewer.householdId), inFull))
        .orderBy(asc(transactions.date), asc(transactions.id), asc(splits.id)),
      db
        .select({ transactionId: transactionTags.transactionId, name: tags.name })
        .from(transactionTags)
        .innerJoin(transactions, eq(transactions.id, transactionTags.transactionId))
        .innerJoin(tags, eq(tags.id, transactionTags.tagId))
        .where(and(eq(transactions.householdId, viewer.householdId), inFull))
        .orderBy(asc(tags.name)),
      db
        .select({
          id: categories.id,
          name: categories.name,
          kind: categories.kind,
          countsTowardBudgets: categories.countsTowardBudgets,
          archived: categories.archived,
          colourSlot: categories.colourSlot,
        })
        .from(categories)
        .where(eq(categories.householdId, viewer.householdId))
        .orderBy(asc(categories.sortOrder), asc(categories.name)),
      ruleList(db, viewer),
      db
        .select({
          id: budgets.id,
          categoryId: budgets.categoryId,
          scope: budgets.scope,
          amountCents: budgets.amountCents,
          period: budgets.period,
          periodAnchor: budgets.periodAnchor,
          periodEnd: budgets.periodEnd,
          periodSecondDay: budgets.periodSecondDay,
          rollover: budgets.rollover,
          onSetDates: budgets.onSetDates,
          alert80: budgets.alert80,
          alert100: budgets.alert100,
        })
        .from(budgets)
        .innerJoin(categories, eq(categories.id, budgets.categoryId))
        .where(
          and(
            eq(budgets.householdId, viewer.householdId),
            or(eq(budgets.scope, "household"), eq(budgets.ownerMemberId, viewer.memberId)),
          ),
        )
        .orderBy(asc(categories.sortOrder), asc(categories.name), asc(budgets.id)),
      paydaysOf(db, viewer),
      seenIds.length
        ? db
            .select({
              accountId: balances.accountId,
              date: balances.date,
              balanceCents: balances.balanceCents,
              workedOut: balances.workedOut,
            })
            .from(balances)
            .where(inArray(balances.accountId, seenIds))
            .orderBy(asc(balances.date), asc(balances.accountId))
        : [],
    ]);

  const linked = new Set(live.filter((row) => row.connectionId).map((row) => row.id));
  const tagsOf = new Map<string, string[]>();
  for (const row of tagRows) {
    tagsOf.set(row.transactionId, [...(tagsOf.get(row.transactionId) ?? []), row.name]);
  }

  return {
    accounts: seen.map((account) => ({
      ...account,
      ownerName:
        account.isJoint || account.ownerMemberId === viewer.memberId
          ? null
          : (names.get(account.ownerMemberId) ?? null),
      live: linked.has(account.id),
    })),
    transactions: rows.map(({ transferGroupId, ...row }) => ({
      ...row,
      transfer: transferGroupId !== null,
      tags: tagsOf.get(row.id) ?? [],
    })),
    splits: parts,
    categories: categoryRows,
    rules: ruleRows,
    budgets: budgetRows,
    incomes: pay.incomes,
    balances: balanceRows,
  };
}

async function isMember(db: Db, viewer: Viewer): Promise<boolean> {
  const [found] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, viewer.memberId), eq(members.householdId, viewer.householdId)));
  return !!found;
}
