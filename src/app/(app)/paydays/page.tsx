import type { Metadata } from "next";
import { PaydaysEditor, type PayAccount, type SavedIncome } from "@/components/paydays";
import { getShell, PageHeader } from "@/components/shell";
import { paydaysOf, paySuggestions, viewerOf, visibleAccounts } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { FoundPay } from "@/lib/sorting/paydays";

export const metadata: Metadata = { title: "When you're paid" };

export default async function PaydaysPage() {
  const shell = await getShell();
  const viewer = viewerOf(await requireMember());
  const db = getDb();
  const [paydays, suggestions, seen] = await Promise.all([
    paydaysOf(db, viewer),
    paySuggestions(db, viewer, shell.today),
    visibleAccounts(db, viewer),
  ]);
  const accounts: PayAccount[] = seen.flatMap((account) =>
    account.access === "full" && account.whose !== "partner"
      ? [{ id: account.id, name: account.name, kind: account.kind, archived: account.archived }]
      : [],
  );

  // A saved income is backed up by the pay it matches: same account, how often and about the
  // same amount.
  const used = new Set<FoundPay>();
  const saved: SavedIncome[] = paydays.incomes.map((income) => {
    const found =
      suggestions.find(
        (pay) =>
          !used.has(pay) &&
          pay.accountId === income.accountId &&
          pay.frequency === income.frequency &&
          Math.abs(pay.amountCents - income.amountCents) * 10 <= income.amountCents,
      ) ?? null;
    if (found) used.add(found);
    return { ...income, found };
  });

  const intro =
    saved.length > 0
      ? "Until payday and your budgets line up with these paydays. Change them whenever your pay does."
      : suggestions.length > 0
        ? "We spotted a regular pay in your deposits. Check it looks right, so Until payday and your budgets line up with it."
        : "Tell us when you're paid, so Until payday and your budgets line up with it.";

  return (
    <>
      <PageHeader
        title="When are you paid?"
        back={{ href: "/accounts", label: "accounts and sharing" }}
        parent={{ href: "/accounts", label: "Accounts and sharing" }}
        actions={null}
        intro={intro}
      />
      <PaydaysEditor
        today={shell.today}
        accounts={accounts}
        saved={saved}
        budgetsRun={paydays.budgetsRun}
        suggestions={suggestions}
        person={{ initials: shell.member.initials, name: shell.member.name }}
        intro={intro}
      />
    </>
  );
}
