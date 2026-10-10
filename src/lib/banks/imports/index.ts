import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { visibleAccounts, type SeenAccount, type Viewer } from "@/lib/access";
import {
  closingBalance,
  matchRows,
  MAX_FILE_BYTES,
  parseBankFile,
  TOO_BIG,
  type ExistingRow,
  type FileLayout,
  type ParsedFile,
  type ParsedRow,
  type RowMatch,
} from "@/lib/banks/files";
import type { Db } from "@/lib/db";
import { accounts, balances, imports, transactions } from "@/lib/db/schema";
import { previewSorting, sortTransactions, type SortingRow } from "@/lib/sorting";
import {
  ACCOUNT_NAME_MAX,
  FILE_ACCOUNT_KINDS,
  type ImportCheck,
  type ImportDone,
  type ImportProblem,
  type ImportRequest,
  type ImportTarget,
  type NewFileAccount,
  type PreviewRow,
  type RecentImport,
  type SortGroup,
} from "./shapes";

export * from "./shapes";

const NO_ACCOUNT = "Pick the account this file is from.";
const NO_NAME = "Give the new account a name.";
const SAVE_FAILED = "That didn't save, so nothing was imported. Try again.";
const NO_ROWS = "We couldn't find any transactions in this file.";

/** Rows per insert, well inside Postgres's limit on query parameters. */
const CHUNK = 500;
/** How many named categories the check lists before "Everything else". */
const SORT_GROUPS = 5;

/**
 * The accounts a member can import a file into: their own and joint ones they can see in full.
 * Not a partner's own accounts, even shared ones, and not archived or hand-entered ones.
 */
export async function importableAccounts(db: Db, viewer: Viewer): Promise<SeenAccount[]> {
  return (await visibleAccounts(db, viewer)).filter(
    (account): account is SeenAccount =>
      account.access === "full" &&
      account.whose !== "partner" &&
      !account.archived &&
      !account.manual,
  );
}

/**
 * Banks whose own layout the file reader knows, and how their name shows up in an account's
 * name or bank. For the "different bank" warning only. Never show these on screen.
 */
const BANK_TEXT: Partial<Record<FileLayout, RegExp>> = {
  westpac: /\bwestpac\b/i,
  anz: /\banz\b/i,
};

/**
 * True when the file is in one bank's own layout and the account names a different bank. Banks
 * that share a layout, or accounts that don't say their bank, never warn.
 */
export function looksLikeAnotherBank(
  account: { name: string; institution: string | null },
  layout: FileLayout,
): boolean {
  const own = BANK_TEXT[layout];
  if (!own) return false;
  const text = `${account.institution ?? ""} ${account.name}`;
  if (own.test(text)) return false;
  return Object.entries(BANK_TEXT).some(
    ([other, pattern]) => other !== layout && pattern.test(text),
  );
}

/** The new account's details tidied, or a plain-words problem. A check can go without a name. */
export function cleanNewAccount(
  details: NewFileAccount,
  needName = true,
): NewFileAccount | ImportProblem {
  const name = details.name.trim().replace(/\s+/g, " ").slice(0, ACCOUNT_NAME_MAX);
  if (!name && needName) return { ok: false, error: NO_NAME };
  const institution = details.institution?.trim().replace(/\s+/g, " ") || null;
  return {
    name,
    institution: institution?.slice(0, ACCOUNT_NAME_MAX) ?? null,
    kind: FILE_ACCOUNT_KINDS.includes(details.kind) ? details.kind : "other",
    isJoint: details.isJoint === true,
  };
}

type Target =
  | { account: SeenAccount; newAccount: null; name: string; institution: string | null }
  | { account: null; newAccount: NewFileAccount; name: string; institution: string | null };

/** The account to import into. A check doesn't need the new account's name yet; an import does. */
async function resolveTarget(
  db: Db,
  viewer: Viewer,
  target: ImportTarget,
  needName: boolean,
): Promise<Target | ImportProblem> {
  if ("accountId" in target) {
    const account = (await importableAccounts(db, viewer)).find((a) => a.id === target.accountId);
    if (!account) return { ok: false, error: NO_ACCOUNT };
    return { account, newAccount: null, name: account.name, institution: account.institution };
  }
  const details = cleanNewAccount(target.newAccount, needName);
  if ("ok" in details) return details;
  return {
    account: null,
    newAccount: details,
    name: details.name,
    institution: details.institution,
  };
}

/** The account's rows the file could match: on the file's dates, or with one of its bank ids. */
async function existingRows(db: Db, accountId: string, rows: readonly ParsedRow[]) {
  if (rows.length === 0) return [];
  const dates = rows.map((row) => row.date).sort();
  const columns = {
    id: transactions.id,
    date: transactions.date,
    amountCents: transactions.amountCents,
    descriptionRaw: transactions.descriptionRaw,
    externalId: transactions.externalId,
    dedupeKey: transactions.dedupeKey,
    source: transactions.source,
  };
  const found = await db
    .select(columns)
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        gte(transactions.date, dates[0]),
        lte(transactions.date, dates[dates.length - 1]),
      ),
    );
  const ids = [...new Set(rows.flatMap((row) => (row.externalId ? [row.externalId] : [])))];
  for (let i = 0; i < ids.length; i += CHUNK) {
    found.push(
      ...(await db
        .select(columns)
        .from(transactions)
        .where(
          and(
            eq(transactions.accountId, accountId),
            inArray(transactions.externalId, ids.slice(i, i + CHUNK)),
          ),
        )),
    );
  }
  const byId = new Map(found.map((row) => [row.id, row]));
  return [...byId.values()] satisfies ExistingRow[];
}

type Plan = {
  ok: true;
  target: Target;
  /** The file as read with the person's columns, when they chose some. */
  file: ParsedFile;
  /** How the file was read before any change of columns, for the different-bank check. */
  layout: FileLayout;
  matches: RowMatch[];
};

/** Reads the file and works out which rows are new. Saves nothing. */
async function plan(
  db: Db,
  viewer: Viewer,
  request: ImportRequest,
  needName: boolean,
): Promise<Plan | ImportProblem> {
  if (request.bytes.length > MAX_FILE_BYTES) return { ok: false, error: TOO_BIG };
  const target = await resolveTarget(db, viewer, request.target, needName);
  if ("ok" in target) return target;
  const first = parseBankFile(request.bytes, request.filename);
  if (!first.ok) return first;
  const file =
    first.format === "csv" && request.columns
      ? parseBankFile(request.bytes, request.filename, { columns: request.columns })
      : first;
  if (!file.ok) return file;
  const existing = target.account ? await existingRows(db, target.account.id, file.rows) : [];
  return { ok: true, target, file, layout: first.layout, matches: matchRows(file.rows, existing) };
}

const sortingRow = (row: ParsedRow, accountId: string): Omit<SortingRow, "id"> => ({
  accountId,
  date: row.date,
  amountCents: row.amountCents,
  description: row.description,
});

/** Row positions in date order, keeping the file's order within a day. */
function dateOrder(rows: readonly ParsedRow[]): number[] {
  return rows
    .map((_, index) => index)
    .sort((a, b) => (rows[a].date < rows[b].date ? -1 : rows[a].date > rows[b].date ? 1 : a - b));
}

function sortGroups(sorted: readonly SortingRow[]): SortGroup[] {
  const groups = new Map<string, Extract<SortGroup, { kind: "category" }>>();
  let toCheck = 0;
  for (const row of sorted) {
    if (!row.category) {
      toCheck += 1;
      continue;
    }
    const { id, ...category } = row.category;
    const group = groups.get(id) ?? { kind: "category", category, rows: 0 };
    group.rows += 1;
    groups.set(id, group);
  }
  const named = [...groups.values()].sort((a, b) => b.rows - a.rows);
  const rest = named.slice(SORT_GROUPS).reduce((sum, group) => sum + group.rows, 0);
  return [
    ...named.slice(0, SORT_GROUPS),
    ...(rest > 0 ? [{ kind: "rest" as const, rows: rest }] : []),
    ...(toCheck > 0 ? [{ kind: "check" as const, rows: toCheck }] : []),
  ];
}

/** "Check before importing": reads the file and says what importing it would do. Saves nothing. */
export async function checkImport(
  db: Db,
  viewer: Viewer,
  request: ImportRequest,
): Promise<ImportCheck | ImportProblem> {
  const planned = await plan(db, viewer, request, false);
  if (!planned.ok) return planned;
  const { target, file, matches } = planned;

  const fresh = matches.filter((match) => match.status === "new");
  const sorted = await previewSorting(
    db,
    viewer.householdId,
    fresh.map((match) => sortingRow(match.row, target.account?.id ?? "")),
  );
  const decided = new Map(fresh.map((match, i) => [match.index, sorted[i]]));
  const shown = (index: number): PreviewRow => {
    const row = file.rows[index];
    const sorting = decided.get(index);
    const category = sorting?.category;
    return {
      date: row.date,
      amountCents: row.amountCents,
      description: row.description,
      name: sorting?.merchant?.name ?? null,
      category: category
        ? {
            name: category.name,
            kind: category.kind,
            icon: category.icon,
            colourSlot: category.colourSlot,
          }
        : null,
      status: !sorting ? "here" : sorting.transferGroupId ? "transfer" : "new",
    };
  };

  const order = dateOrder(file.rows);
  const inOrder = (status: "new" | "here", count: number) =>
    order
      .filter((index) => matches[index].status === status)
      .slice(0, count)
      .map(shown);
  const dates = order.map((index) => file.rows[index].date);
  const isCsv = file.format === "csv";
  const problem = isCsv && file.rows.length === 0 ? (file.warnings[0] ?? null) : null;

  return {
    ok: true,
    file: { name: request.filename, size: request.bytes.length, format: file.format },
    accountName: target.name,
    mismatch: looksLikeAnotherBank(target, planned.layout),
    columns: file.columns,
    canChangeColumns: isCsv,
    needsCheck: file.needsCheck,
    problem,
    warnings: problem ? file.warnings.slice(1) : file.warnings,
    rows: file.rows.length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    fresh: fresh.length,
    here: matches.length - fresh.length,
    transfers: sorted.filter((row) => row.transferGroupId).length,
    sorted: sorted.filter((row) => row.category).length,
    toCheck: sorted.filter((row) => !row.category).length,
    sorts: sortGroups(sorted),
    preview: order.slice(0, 10).map(shown),
    firstNew: inOrder("new", 6),
    firstHere: inOrder("here", 2),
    balance: closingBalance(file),
  };
}

/**
 * Imports the file's new rows in one database transaction: makes the account if it's new, saves
 * the rows, records the import, sorts the rows and saves the balance the file ends on. Rows
 * already here are skipped. If anything fails, nothing is saved.
 */
export async function runImport(
  db: Db,
  viewer: Viewer,
  request: ImportRequest,
): Promise<ImportDone | ImportProblem> {
  try {
    return await db.transaction(async (tx) => {
      const planned = await plan(tx, viewer, request, true);
      if (!planned.ok) return planned;
      const { target, file, matches } = planned;
      if (file.format === "csv" && file.rows.length === 0) {
        return { ok: false, error: file.warnings[0] ?? NO_ROWS };
      }

      let accountId = target.account?.id;
      if (!accountId) {
        const [made] = await tx
          .insert(accounts)
          .values({
            householdId: viewer.householdId,
            ownerMemberId: viewer.memberId,
            name: target.newAccount!.name,
            institution: target.newAccount!.institution,
            kind: target.newAccount!.kind,
            isJoint: target.newAccount!.isJoint,
            // As when connecting a bank: joint accounts start Shared, your own start Private.
            visibility: target.newAccount!.isJoint ? "shared" : "private",
          })
          .returning({ id: accounts.id });
        accountId = made.id;
      }

      const [record] = await tx
        .insert(imports)
        .values({
          householdId: viewer.householdId,
          accountId,
          memberId: viewer.memberId,
          filename: request.filename.slice(0, 255),
          format: file.format,
          rows: file.rows.length,
        })
        .returning({ id: imports.id });

      const fresh = matches.filter((match) => match.status === "new");
      const saved: SortingRow[] = [];
      for (let i = 0; i < fresh.length; i += CHUNK) {
        const inserted = await tx
          .insert(transactions)
          .values(
            fresh.slice(i, i + CHUNK).map((match) => ({
              householdId: viewer.householdId,
              accountId: accountId!,
              externalId: match.externalId,
              date: match.row.date,
              amountCents: match.row.amountCents,
              descriptionRaw: match.row.description,
              source: "file" as const,
              importId: record.id,
              dedupeKey: match.dedupeKey,
            })),
          )
          // Another import of the same rows at the same moment can't double them up.
          .onConflictDoNothing()
          .returning({
            id: transactions.id,
            date: transactions.date,
            amountCents: transactions.amountCents,
            description: transactions.descriptionRaw,
          });
        saved.push(...inserted.map((row) => ({ ...row, accountId: accountId! })));
      }

      const counts = await sortTransactions(tx, viewer.householdId, saved);

      const balance = closingBalance(file);
      if (balance) {
        await tx
          .insert(balances)
          .values({ accountId, ...balance })
          .onConflictDoUpdate({
            target: [balances.accountId, balances.date],
            set: { balanceCents: balance.balanceCents },
          });
      }

      const skipped = file.rows.length - saved.length;
      await tx
        .update(imports)
        .set({ imported: saved.length, skipped })
        .where(eq(imports.id, record.id));

      const dates = file.rows.map((row) => row.date).sort();
      return {
        ok: true,
        importId: record.id,
        accountId,
        accountName: target.name,
        filename: request.filename,
        rows: file.rows.length,
        imported: saved.length,
        skipped,
        from: dates[0] ?? null,
        to: dates[dates.length - 1] ?? null,
        ...counts,
      } satisfies ImportDone;
    });
  } catch (error) {
    // Only the error's code: a database message can quote the rows, and logs never hold those.
    console.error("Import failed", (error as { code?: string }).code ?? (error as Error).name);
    return { ok: false, error: SAVE_FAILED };
  }
}

/** The latest imports into accounts the member can import into, newest first. */
export async function recentImports(db: Db, viewer: Viewer, limit = 5): Promise<RecentImport[]> {
  const mine = await importableAccounts(db, viewer);
  if (mine.length === 0) return [];
  const names = new Map(mine.map((account) => [account.id, account.name]));
  const rows = await db
    .select({
      id: imports.id,
      accountId: imports.accountId,
      filename: imports.filename,
      createdAt: imports.createdAt,
      rows: imports.rows,
      imported: imports.imported,
      skipped: imports.skipped,
    })
    .from(imports)
    .where(
      and(
        eq(imports.householdId, viewer.householdId),
        inArray(imports.accountId, [...names.keys()]),
      ),
    )
    .orderBy(desc(imports.createdAt), desc(imports.id))
    .limit(limit);
  return rows.map(({ accountId, ...row }) => ({ ...row, accountName: names.get(accountId)! }));
}
