import type { People } from "@/components/activity";
import { startingPeriod } from "@/components/budgets/budgets";
import { HomeOverview, LATEST_ROWS, type HomeData } from "@/components/home";
import { getShell, PageHeader, SyncWarningBanner } from "@/components/shell";
import { initialsOf } from "@/components/shell/data";
import {
  activityCounts,
  activityPage,
  budgetProgress,
  moneyInOut,
  otherMembers,
  paydaysOf,
  viewerOf,
  visibleAccounts,
} from "@/lib/access";
import { specOf } from "@/lib/access/plan";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { mainIncome, periodContaining } from "@/lib/money";

export default async function HomePage() {
  const shell = await getShell();
  const viewer = viewerOf(await requireMember());
  const db = getDb();
  const today = shell.today;

  const [paydays, counts, seen, others] = await Promise.all([
    paydaysOf(db, viewer),
    activityCounts(db, viewer),
    visibleAccounts(db, viewer),
    otherMembers(db, viewer),
  ]);
  // The same period as Budgets: the person's pay cycle, weeks or the calendar month.
  const spec = specOf(startingPeriod(paydays.budgetsRun, paydays.incomes));
  const period = periodContaining(today, spec)!;
  const [progress, money, latest] = await Promise.all([
    budgetProgress(db, viewer, { spec, period, today, timeZone: shell.timeZone }),
    moneyInOut(db, viewer, "household", { from: period.start, to: today }),
    activityPage(db, viewer, "household", {}, undefined, LATEST_ROWS),
  ]);

  const accounts = seen.flatMap((account) =>
    account.access === "full" && !account.archived ? [account] : [],
  );
  const firstWeek = counts.all === 0 || progress.lines.length === 0;
  const partner = others[0];
  const people: People = {
    me: { name: shell.member.name, initials: shell.member.initials },
    partner: partner ? { name: partner.name, initials: initialsOf(partner.name) } : null,
  };
  const data: HomeData = {
    today,
    progress,
    money,
    latest: latest.rows,
    people,
    firstName: shell.member.name.trim().split(/\s+/)[0] || shell.member.name,
    setup: firstWeek
      ? {
          today,
          period,
          spec,
          transactions: counts.all,
          since: counts.since,
          toCheck: counts.toCheck,
          accounts,
          banks: new Set(accounts.flatMap((account) => account.institution ?? [])).size,
          live: shell.live.connections,
          pay: mainIncome(paydays.incomes),
          budgets: progress.lines.length,
        }
      : null,
  };

  return (
    <>
      <PageHeader title="Home" home />
      <SyncWarningBanner />
      <HomeOverview data={data} />
    </>
  );
}
