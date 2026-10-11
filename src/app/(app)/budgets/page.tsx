import type { Metadata } from "next";
import { BudgetsHeadActions, BudgetsOverview, type PeriodLinks } from "@/components/budgets";
import { startingPeriod } from "@/components/budgets/budgets";
import { getShell, PageHeader } from "@/components/shell";
import { IconButtonLink } from "@/components/ui";
import { budgetProgress, paydaysOf, viewerOf } from "@/lib/access";
import { specOf } from "@/lib/access/plan";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { addDays, formatShortDate, isPlainDate, periodContaining, type Period } from "@/lib/money";

export const metadata: Metadata = { title: "Budgets" };

/** How far back the arrows go: two years of periods. */
const LOOK_BACK_DAYS = 731;

type Params = { from?: string | string[] };

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const shell = await getShell();
  const viewer = viewerOf(await requireMember());
  const db = getDb();
  const paydays = await paydaysOf(db, viewer);

  // The page runs in the person's own periods: their pay cycle, weeks or months.
  const spec = specOf(startingPeriod(paydays.budgetsRun, paydays.incomes));
  const current = periodContaining(shell.today, spec)!;
  const { from } = await searchParams;
  const asked = typeof from === "string" && isPlainDate(from) ? periodContaining(from, spec) : null;
  const earliest = periodContaining(addDays(shell.today, -LOOK_BACK_DAYS), spec)!;
  const period: Period =
    asked && asked.start <= current.start && asked.start >= earliest.start ? asked : current;

  const progress = await budgetProgress(db, viewer, {
    spec,
    period,
    today: shell.today,
    timeZone: shell.timeZone,
  });
  const hrefFor = (p: Period | null) =>
    p === null ? null : p.start === current.start ? "/budgets" : `/budgets?from=${p.start}`;
  const links: PeriodLinks = {
    previous:
      progress.previous && progress.previous.start >= earliest.start
        ? hrefFor(progress.previous)
        : null,
    next: hrefFor(progress.next),
  };
  const day = progress.day;

  return (
    <>
      <PageHeader
        title="Budgets"
        line={
          day
            ? `${formatShortDate(shell.today)} · Day ${day.day} of ${day.of}`
            : `${formatShortDate(shell.today)} · Looking back`
        }
        actions={<BudgetsHeadActions progress={progress} links={links} />}
        phoneActions={
          <IconButtonLink icon="plus" label="Add or change a budget" href="/budgets/plan" />
        }
      />
      <BudgetsOverview progress={progress} links={links} />
    </>
  );
}
