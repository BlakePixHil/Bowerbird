import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { People } from "@/components/activity";
import { startingPeriod } from "@/components/budgets/budgets";
import {
  DESKTOP_LATEST_ROWS,
  HOME_MONTHS,
  HomeOverview,
  thisName,
  wholeMonths,
  type HomeData,
} from "@/components/home";
import { accountIcon, accountMeta } from "@/components/import/labels";
import { deviceOf, InstallNudge, kindOf } from "@/components/install";
import { getShell, PageHeader, SyncWarningBanner } from "@/components/shell";
import { initialsOf } from "@/components/shell/data";
import {
  activityCounts,
  activityPage,
  budgetProgress,
  latestBalances,
  moneyInOut,
  monthlyInOut,
  otherMembers,
  paydaysOf,
  viewerOf,
  visibleAccounts,
} from "@/lib/access";
import { specOf } from "@/lib/access/plan";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { showsInstallPrompt } from "@/lib/install";
import { addDays, addMonths, mainIncome, periodContaining } from "@/lib/money";

export default async function HomePage() {
  const me = await requireMember();
  // Until the first run is finished, opening the app picks it up where it stopped.
  if (me.member.setupStep) redirect("/start");
  const shell = await getShell();
  const viewer = viewerOf(me);
  const db = getDb();
  const today = shell.today;
  const device = deviceOf((await headers()).get("user-agent"));

  const [paydays, counts, seen, others] = await Promise.all([
    paydaysOf(db, viewer),
    activityCounts(db, viewer),
    visibleAccounts(db, viewer),
    otherMembers(db, viewer),
  ]);
  // The same period as Budgets: the person's pay cycle, weeks or the calendar month.
  const spec = specOf(startingPeriod(paydays.budgetsRun, paydays.incomes));
  const period = periodContaining(today, spec)!;
  // Desktop's Money in, money out: the whole months before this one, from Activity's totals too.
  const thisMonth = `${today.slice(0, 7)}-01`;
  const [progress, money, latest, sums, balances] = await Promise.all([
    budgetProgress(db, viewer, { spec, period, today, timeZone: shell.timeZone }),
    moneyInOut(db, viewer, "household", { from: period.start, to: today }),
    activityPage(db, viewer, "household", {}, undefined, DESKTOP_LATEST_ROWS),
    monthlyInOut(db, viewer, "household", {
      from: addMonths(thisMonth, -HOME_MONTHS),
      to: addDays(thisMonth, -1),
    }),
    latestBalances(db, viewer, "household"),
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
    months: wholeMonths(sums, today, counts.since),
    people,
    firstName: shell.member.name.trim().split(/\s+/)[0] || shell.member.name,
    accounts: firstWeek
      ? accounts.map((account) => ({
          id: account.id,
          name: account.name,
          meta: accountMeta(account),
          icon: accountIcon(account),
          balanceCents: balances.get(account.id) ?? null,
        }))
      : [],
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
          installed: shell.installed,
          device: kindOf(device),
        }
      : null,
  };

  return (
    <>
      <PageHeader title={firstWeek ? "Home" : `${thisName(period, spec)} so far`} home />
      <SyncWarningBanner />
      {!firstWeek && showsInstallPrompt(me.member, shell.now) && <InstallNudge device={device} />}
      <HomeOverview data={data} />
    </>
  );
}
