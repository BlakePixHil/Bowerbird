import type { Metadata } from "next";
import {
  ActivityChips,
  ActivityList,
  ActivitySearch,
  filtersOf,
  ImportCard,
  MissingSomething,
  parseSearch,
  parseShow,
  viewOf,
  WeekSummary,
  type ChipChoice,
  type People,
} from "@/components/activity";
import { getShell, PageHeader, SyncNowButton, SyncWarningBanner } from "@/components/shell";
import { initialsOf } from "@/components/shell/data";
import { ButtonLink, EmptyState, IconButtonLink } from "@/components/ui";
import {
  activityCounts,
  activityPage,
  countActivity,
  dailySpending,
  otherMembers,
  viewerOf,
} from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { addDays, USUAL_WEEKS, weekSpending } from "@/lib/money";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; show?: string | string[] }>;
}) {
  const shell = await getShell();
  const me = await requireMember();
  const params = await searchParams;
  const search = parseSearch(params.q);
  const show = parseShow(params.show);
  const db = getDb();
  const viewer = viewerOf(me);
  const view = viewOf(show);
  const filters = filtersOf(show, search);
  const today = shell.today;

  const [counts, first, total, spending, others] = await Promise.all([
    activityCounts(db, viewer),
    activityPage(db, viewer, view, filters),
    countActivity(db, viewer, view, filters),
    // Two weeks on the chart, and up to twelve weeks before this one for a usual week.
    dailySpending(db, viewer, view, {
      from: addDays(today, -7 * (USUAL_WEEKS + 1) + 1),
      to: today,
    }),
    otherMembers(db, viewer),
  ]);

  const header = (
    <PageHeader
      title="Activity"
      phoneActions={<IconButtonLink href="/import" icon="upload" label="Import a bank file" />}
      actions={
        <>
          <ActivitySearch show={show} search={search} place="desktop" />
          <ButtonLink href="/import" icon="upload">
            Import a file
          </ButtonLink>
          <SyncNowButton />
        </>
      }
    />
  );

  if (counts.all === 0)
    return (
      <>
        {header}
        <SyncWarningBanner />
        <EmptyState
          icon="list"
          title="No transactions yet"
          action={
            <ButtonLink href="/import" icon="upload" variant="primary">
              Import a bank file
            </ButtonLink>
          }
        >
          Every transaction from your accounts will be listed here, newest first, with the category
          it counts toward.
        </EmptyState>
      </>
    );

  const partner = others[0];
  const people: People = {
    me: { name: shell.member.name, initials: shell.member.initials },
    partner: partner ? { name: partner.name, initials: initialsOf(partner.name) } : null,
  };
  const choices: ChipChoice[] = [{ show: "all", label: "All", count: counts.all }];
  // Yours and Shared only help when there's more than one kind of account to tell apart.
  if (counts.byWhose.mine > 0 && counts.byWhose.mine < counts.all) {
    choices.push({
      show: "mine",
      label: "Yours",
      count: counts.byWhose.mine,
      avatar: { owner: "you", initials: people.me.initials, label: people.me.name },
    });
  }
  if (counts.byWhose.shared > 0 && counts.byWhose.shared < counts.all) {
    choices.push({
      show: "shared",
      label: "Shared",
      count: counts.byWhose.shared,
      avatar: { owner: "shared", initials: "S", label: "Shared" },
    });
  }
  if (counts.toCheck > 0 || show === "check") {
    choices.push({ show: "check", label: "To check", count: counts.toCheck, icon: "flag" });
  }

  return (
    <>
      {header}
      <SyncWarningBanner />
      <ActivitySearch show={show} search={search} place="phone" />
      <ActivityChips choices={choices} show={show} search={search} />
      <WeekSummary spending={weekSpending(spending.days, today, spending.since)} today={today} />
      <ActivityList
        key={`${show}|${search}|${total}|${first.rows[0]?.id ?? ""}`}
        first={first}
        show={show}
        search={search}
        total={total}
        today={today}
        people={people}
        footer={<MissingSomething />}
        side={<ImportCard liveSync={shell.live.connections > 0} />}
      />
    </>
  );
}
