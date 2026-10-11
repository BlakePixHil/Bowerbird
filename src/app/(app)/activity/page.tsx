import type { Metadata } from "next";
import {
  ActivityChips,
  ActivityList,
  ActivitySearch,
  FilteredBy,
  filtersOf,
  FiltersButton,
  FindProvider,
  FindTransactions,
  ImportCard,
  MissingSomething,
  parseSearch,
  parseShow,
  viewOf,
  WeekSummary,
  type ChipChoice,
  type People,
  type ViewChip,
} from "@/components/activity";
import { activityHref } from "@/components/activity/show";
import {
  filtersKey,
  findChips,
  findFromParams,
  isAnything,
  type FindLists,
} from "@/components/activity/find";
import { getShell, PageHeader, SyncNowButton, SyncWarningBanner } from "@/components/shell";
import { initialsOf } from "@/components/shell/data";
import { ButtonLink, EmptyState, IconButtonLink } from "@/components/ui";
import {
  activityCounts,
  activityPage,
  ANYTHING,
  categoryChoices,
  countActivity,
  dailySpending,
  knownFind,
  otherMembers,
  savedViewList,
  tagChoices,
  viewerOf,
  visibleAccounts,
} from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { addDays, USUAL_WEEKS, weekSpending } from "@/lib/money";

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Params> }) {
  const shell = await getShell();
  const me = await requireMember();
  const params = await searchParams;
  const search = parseSearch(first(params.q));
  const show = parseShow(first(params.show));
  const db = getDb();
  const viewer = viewerOf(me);
  const view = viewOf(show);
  const today = shell.today;

  const [counts, seen, others, categories, tags, views] = await Promise.all([
    activityCounts(db, viewer),
    visibleAccounts(db, viewer),
    otherMembers(db, viewer),
    categoryChoices(db, viewer),
    tagChoices(db, viewer),
    savedViewList(db, viewer),
  ]);
  const lists: FindLists = {
    accounts: seen.flatMap((account) =>
      account.access === "full" && !account.archived
        ? [{ id: account.id, name: account.name, whose: account.whose }]
        : [],
    ),
    categories,
    tags,
  };
  const known = {
    accounts: lists.accounts.map((a) => a.id),
    categories: categories.map((c) => c.id),
    tags: tags.map((t) => t.id),
  };
  const find = knownFind(
    findFromParams((key) => first(params[key])),
    known,
  );
  const filters = filtersOf(show, search, find, today);

  const [page, total, spending, viewCounts] = await Promise.all([
    activityPage(db, viewer, view, filters),
    countActivity(db, viewer, view, filters),
    // Two weeks on the chart, and up to twelve weeks before this one for a usual week.
    dailySpending(db, viewer, view, {
      from: addDays(today, -7 * (USUAL_WEEKS + 1) + 1),
      to: today,
    }),
    Promise.all(
      views.map((saved) =>
        countActivity(
          db,
          viewer,
          "household",
          filtersOf("all", saved.filters.search, knownFind(saved.filters.find, known), today),
        ),
      ),
    ),
  ]);

  const chips = findChips(find, lists, today);
  const filtered = !isAnything(find);
  const header = (
    <PageHeader
      title="Activity"
      phoneActions={
        counts.all > 0 ? (
          <>
            <FiltersButton place="phone" count={chips.length} />
            <IconButtonLink href="/import" icon="upload" label="Import a bank file" />
          </>
        ) : (
          <IconButtonLink href="/import" icon="upload" label="Import a bank file" />
        )
      }
      actions={
        <>
          <ActivitySearch show={show} search={search} find={find} place="desktop" />
          {counts.all > 0 && <FiltersButton place="desktop" count={chips.length} />}
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
      <FindProvider>
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
      </FindProvider>
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

  const viewChips: ViewChip[] = views.map((saved, i) => ({
    id: saved.id,
    name: saved.name,
    count: viewCounts[i],
    href: activityHref("all", saved.filters.search, saved.filters.find),
    on:
      show === "all" &&
      filtersKey({ search: saved.filters.search, find: knownFind(saved.filters.find, known) }) ===
        filtersKey({ search, find }),
  }));
  const offerMine = lists.accounts.some((account) => account.whose !== "mine");
  const shownKey = `${show}|${filtersKey({ search, find })}`;

  return (
    <FindProvider>
      {header}
      <SyncWarningBanner />
      <FindTransactions
        show={show}
        search={search}
        find={find}
        total={total}
        today={today}
        lists={lists}
        people={people}
        offerMine={offerMine}
        views={views}
      />
      <ActivitySearch show={show} search={search} find={find} place="phone" />
      <ActivityChips choices={choices} views={viewChips} show={show} search={search} find={find} />
      <WeekSummary spending={weekSpending(spending.days, today, spending.since)} today={today} />
      <ActivityList
        // A new import or sync starts the list again. Sorting rows out of To check changes its
        // total and top row too, but the list stays put so the open transaction doesn't close.
        key={show === "check" ? shownKey : `${shownKey}|${total}|${page.rows[0]?.id ?? ""}`}
        first={page}
        show={show}
        search={search}
        find={find}
        filteredBy={
          <FilteredBy
            chips={chips.map((chip) => ({
              key: chip.key,
              label: chip.label,
              colour: chip.colour,
              href: activityHref(show, search, chip.without),
            }))}
            clearHref={activityHref(show, search, ANYTHING)}
          />
        }
        clearFilters={filtered ? activityHref(show, search, ANYTHING) : null}
        total={total}
        today={today}
        people={people}
        categories={categories}
        tagChoices={tags}
        footer={<MissingSomething />}
        side={<ImportCard liveSync={shell.live.connections > 0} />}
      />
    </FindProvider>
  );
}
