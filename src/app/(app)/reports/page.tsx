import type { Metadata } from "next";
import { startingPeriod } from "@/components/budgets/budgets";
import { ReportsOverview } from "@/components/reports";
import {
  CARD_MONTHS,
  leftOverCard,
  moneyInOutCard,
  planVsRealityCard,
} from "@/components/reports/cards";
import { getShell, PageHeader, REPORTS, visible } from "@/components/shell";
import { activityCounts, budgetProgress, monthlyInOut, paydaysOf, viewerOf } from "@/lib/access";
import { specOf } from "@/lib/access/plan";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { addMonths, periodContaining } from "@/lib/money";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const shell = await getShell();
  const viewer = viewerOf(await requireMember());
  const db = getDb();
  const today = shell.today;

  const [paydays, counts] = await Promise.all([paydaysOf(db, viewer), activityCounts(db, viewer)]);
  // Plan vs reality is Budgets' own, so the same period as Budgets.
  const spec = specOf(startingPeriod(paydays.budgetsRun, paydays.incomes));
  const period = periodContaining(today, spec)!;
  // Money in, money out's 12 whole months, and this one so far.
  const thisMonth = `${today.slice(0, 7)}-01`;
  const [progress, sums] = await Promise.all([
    budgetProgress(db, viewer, { spec, period, today, timeZone: shell.timeZone }),
    monthlyInOut(db, viewer, "household", { from: addMonths(thisMonth, -CARD_MONTHS), to: today }),
  ]);

  return (
    <>
      <PageHeader title="Reports" actions={null} />
      <p className={styles.intro}>Your household, run like a small business, in plain words.</p>
      <ReportsOverview
        reports={visible(REPORTS)}
        data={{
          inOut: moneyInOutCard(sums, today, counts.since),
          leftOver: leftOverCard(sums, today, counts.since),
          plan: planVsRealityCard(progress),
        }}
      />
    </>
  );
}
