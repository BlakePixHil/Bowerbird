import { paydaysOf, paySuggestions, visibleAccounts, type Viewer } from "@/lib/access";
import type { Db } from "@/lib/db";
import type { PlainDate } from "@/lib/money";
import type { FoundPay } from "@/lib/sorting/paydays";
import type { PayAccount, SavedIncome } from "./PaydaysEditor";

/**
 * What "When are you paid?" needs, for its own page and for the first run's step 3: the person's
 * accounts, their saved incomes with the deposits backing each, the pay the app spotted, and the
 * words under the title.
 */
export async function loadPaydays(db: Db, viewer: Viewer, today: PlainDate) {
  const [paydays, suggestions, seen] = await Promise.all([
    paydaysOf(db, viewer),
    paySuggestions(db, viewer, today),
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

  return { accounts, saved, suggestions, budgetsRun: paydays.budgetsRun, intro };
}
