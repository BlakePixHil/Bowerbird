import type { Metadata } from "next";
import {
  PlanActions,
  PlanEditor,
  PlanProvider,
  type MoneyIn,
  type PlanCategory,
} from "@/components/budgets";
import { payAsAMonth } from "@/components/budgets/budgets";
import { colourOf, iconOf, monthName, monthShort } from "@/components/categories/look";
import { getShell, PageHeader } from "@/components/shell";
import { budgetsOf, categoryOverview, paydaysOf, viewerOf } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Change the plan" };

export default async function PlanPage() {
  const shell = await getShell();
  const viewer = viewerOf(await requireMember());
  const db = getDb();
  const [budgets, overview, paydays] = await Promise.all([
    budgetsOf(db, viewer),
    categoryOverview(db, viewer, shell.today),
    paydaysOf(db, viewer),
  ]);

  // Only the months since money first came in count toward an average.
  const recent = <T,>(list: readonly T[]) =>
    overview.counted > 0 ? list.slice(-overview.counted) : [];
  const categories: PlanCategory[] = overview.categories
    .filter((category) => category.kind === "spending" && category.countsTowardBudgets)
    .map((category) => ({
      id: category.id,
      name: category.name,
      icon: iconOf(category),
      colour: colourOf(category),
      thisMonth: category.cents,
      lastMonth: category.months.at(-1) ?? 0,
      months: recent(category.months),
      usual: category.usual,
    }));

  const usualIn = overview.categories
    .filter((category) => category.kind === "income")
    .reduce((sum, category) => sum + category.usual, 0);
  const moneyIn: MoneyIn | null =
    paydays.incomes.length > 0
      ? { cents: payAsAMonth(paydays.incomes), from: "pay", months: 0 }
      : overview.counted > 0 && usualIn > 0
        ? { cents: usualIn, from: "average", months: overview.counted }
        : null;

  const lastMonth = overview.monthStarts.at(-1) ?? overview.from;
  return (
    <PlanProvider
      today={shell.today}
      monthName={monthName(overview.from)}
      lastMonthName={monthName(lastMonth)}
      monthLabels={overview.monthStarts.map(monthShort)}
      categories={categories}
      budgets={budgets}
      moneyIn={moneyIn}
      budgetsRun={paydays.budgetsRun}
      incomes={paydays.incomes}
    >
      <PageHeader
        title="Change the plan"
        back={{ href: "/budgets", label: "budgets" }}
        parent={{ href: "/budgets", label: "Budgets" }}
        intro="Your budgets. Set each one in whatever period suits it, and see it as a month."
        actions={<PlanActions />}
      />
      <PlanEditor />
    </PlanProvider>
  );
}
