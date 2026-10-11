import { KIND_LABELS, kindOf, PERIOD_LABELS } from "@/components/budgets/budgets";
import { KIND_LABEL } from "@/components/import/labels";
import { FREQUENCY_LABELS } from "@/components/paydays/paydays";
import { APP_NAME } from "@/config/app";
import type { ExportAccount, ExportData } from "@/lib/access";
import { csv, type Cell } from "@/lib/export/csv";
import type { ZipFile } from "@/lib/export/zip";
import type { PlainDate } from "@/lib/money";

/*
 * The files in Export everything, one CSV for each kind of thing, with headings in the app's own
 * words. Amounts are dollars and cents, money out negative, as on Activity. Each transaction has
 * an id, so its split parts can be matched to it.
 */

const VISIBILITY: Record<ExportAccount["visibility"], string> = {
  shared: "Shared",
  balance_only: "Balance only",
  private: "Private",
};

const CATEGORY_KIND: Record<string, string> = {
  spending: "Spending",
  income: "Income",
  transfer: "Not counted",
};

/** "bowerbird-export-2026-10-11", the zip's name and the folder inside it. */
export function exportName(today: PlainDate): string {
  return `${APP_NAME.toLowerCase()}-export-${today}`;
}

function whose(account: ExportAccount): string {
  if (account.isJoint) return "Joint";
  return account.ownerName ? `${account.ownerName}’s` : "Yours";
}

/** Every file, built from what the member may see, one at a time as the zip asks for it. */
export function* exportFiles(data: ExportData, today: PlainDate): Generator<ZipFile> {
  const encoder = new TextEncoder();
  const folder = exportName(today);
  const accountName = new Map(data.accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(data.categories.map((c) => [c.id, c.name]));
  const latest = new Map<string, { date: PlainDate; cents: number }>();
  for (const balance of data.balances) {
    latest.set(balance.accountId, { date: balance.date, cents: balance.balanceCents });
  }
  const split = new Set(data.splits.map((part) => part.transactionId));
  const transaction = new Map(data.transactions.map((t) => [t.id, t]));

  const files: [string, () => string][] = [
    [
      "accounts.csv",
      () =>
        csv(
          [
            "Account",
            "Bank",
            "Kind",
            "Whose",
            "Who can see it",
            "You see",
            "Counts toward budgets",
            "Archived",
            "Comes in by",
            "Latest balance",
            "Latest balance date",
          ],
          data.accounts.map((a): Cell[] => {
            const last = latest.get(a.id);
            return [
              a.name,
              a.institution,
              KIND_LABEL[a.kind],
              whose(a),
              VISIBILITY[a.visibility],
              a.access === "full" ? "Everything" : "Balance only",
              a.includeInBudgets,
              a.archived,
              a.live ? "Live sync" : a.manual ? "By hand" : "Bank files",
              last ? { cents: last.cents } : null,
              last?.date,
            ];
          }),
        ),
    ],
    [
      "transactions.csv",
      () =>
        csv(
          [
            "Date",
            "Account",
            "Description",
            "Shop",
            "Amount",
            "Category",
            "Split",
            "Tags",
            "Note",
            "Pending",
            "Transfer between your accounts",
            "Came from",
            "Transaction id",
          ],
          data.transactions.map((t): Cell[] => [
            t.date,
            accountName.get(t.accountId),
            t.description,
            t.shop,
            { cents: t.amountCents },
            t.categoryId ? categoryName.get(t.categoryId) : null,
            split.has(t.id),
            t.tags.join("; "),
            t.note,
            t.pending,
            t.transfer,
            t.source === "sync" ? "Live sync" : "Bank file",
            t.id,
          ]),
        ),
    ],
    [
      "splits.csv",
      () =>
        csv(
          ["Date", "Account", "Description", "Part", "Category", "Transaction id"],
          data.splits.map((part): Cell[] => {
            const t = transaction.get(part.transactionId);
            return [
              t?.date,
              t ? accountName.get(t.accountId) : null,
              t?.description,
              { cents: part.amountCents },
              categoryName.get(part.categoryId),
              part.transactionId,
            ];
          }),
        ),
    ],
    [
      "categories.csv",
      () =>
        csv(
          ["Category", "Kind", "Counts toward budgets", "Archived", "Colour"],
          data.categories.map((c): Cell[] => [
            c.name,
            CATEGORY_KIND[c.kind] ?? c.kind,
            c.kind === "spending" ? c.countsTowardBudgets : null,
            c.archived,
            c.colourSlot ? `Colour ${c.colourSlot}` : "Grey",
          ]),
        ),
    ],
    [
      "rules.csv",
      () =>
        csv(
          ["When", "Matches", "Category", "Tag", "On", "Sorted so far"],
          data.rules.map((rule): Cell[] => [
            rule.shop ? rule.shop.name : rule.matchText,
            rule.shop ? "Shop" : "Bank text",
            rule.category.name,
            rule.tag?.name,
            rule.enabled,
            rule.sorted,
          ]),
        ),
    ],
    [
      "budgets.csv",
      () =>
        csv(
          [
            "Category",
            "Whose",
            "Amount",
            "How often",
            "Counts from",
            "Last day",
            "Kind",
            "Alert at 80%",
            "Alert at 100%",
          ],
          data.budgets.map((b): Cell[] => [
            categoryName.get(b.categoryId),
            b.scope === "household" ? "Household" : "Yours",
            { cents: b.amountCents },
            PERIOD_LABELS[b.period],
            b.periodAnchor,
            b.periodEnd,
            KIND_LABELS[kindOf(b)],
            b.alert80,
            b.alert100,
          ]),
        ),
    ],
    [
      "incomes.csv",
      () =>
        csv(
          ["Income", "Amount", "How often", "A payday", "Second day of the month", "Paid into"],
          data.incomes.map((income): Cell[] => [
            income.label,
            { cents: income.amountCents },
            FREQUENCY_LABELS[income.frequency],
            income.anchorDate,
            income.secondDay,
            income.accountId ? accountName.get(income.accountId) : null,
          ]),
        ),
    ],
    [
      "balances.csv",
      () =>
        csv(
          ["Date", "Account", "Balance", "Worked out"],
          data.balances.map((b): Cell[] => [
            b.date,
            accountName.get(b.accountId),
            { cents: b.balanceCents },
            b.workedOut,
          ]),
        ),
    ],
  ];
  for (const [name, text] of files)
    yield { name: `${folder}/${name}`, data: encoder.encode(text()) };
}
