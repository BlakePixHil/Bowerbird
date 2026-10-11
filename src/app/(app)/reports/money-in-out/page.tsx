import type { Metadata } from "next";
import { MoneyInOutReport, PhoneRangeChips, RangeChips } from "@/components/reports";
import {
  moneyReport,
  rangeMonths,
  rangeOf,
  reportFrom,
  type ReportRange,
} from "@/components/reports/money";
import { getShell, PageHeader } from "@/components/shell";
import { EmptyState } from "@/components/ui";
import {
  activityCounts,
  categoryChoices,
  monthlyInBySource,
  monthlyInOut,
  monthlyOutByCategory,
  viewerOf,
} from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { addDays, addMonths } from "@/lib/money";

export const metadata: Metadata = { title: "Money in, money out" };

type Search = { range?: string | string[]; month?: string | string[] };
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function Header({ range }: { range: ReportRange }) {
  return (
    <PageHeader
      title="Money in, money out"
      back={{ href: "/reports", label: "reports" }}
      parent={{ href: "/reports", label: "Reports" }}
      actions={<RangeChips range={range} />}
    />
  );
}

export default async function MoneyInOutPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const range = rangeOf(one(search.range));
  const shell = await getShell();
  const viewer = viewerOf(await requireMember());
  const db = getDb();

  const counts = await activityCounts(db, viewer);
  const months = rangeMonths(range, shell.today, counts.since);
  if (months.length === 0)
    return (
      <>
        <Header range={range} />
        <PhoneRangeChips range={range} />
        <EmptyState icon="in-out" title="Nothing to compare yet">
          {range === "fy" && rangeMonths("12m", shell.today, counts.since).length > 0
            ? "This financial year's first month isn't over yet. Its numbers show here from 1 August."
            : "Once a whole month of transactions is in, this shows what came in, what went out and what you kept."}
        </EmptyState>
        <div id="left-over">
          <EmptyState icon="box" title="What's left over">
            The share of your pay you kept each month will show here.
          </EmptyState>
        </div>
      </>
    );

  // Every month the page can pick, plus the 6 months before for each one's usual month.
  const to = addDays(addMonths(months.at(-1)!, 1), -1);
  const [sums, byCategory, sources, categories] = await Promise.all([
    monthlyInOut(db, viewer, "household", { from: months[0], to }),
    monthlyOutByCategory(db, viewer, "household", { from: reportFrom(months), to }),
    monthlyInBySource(db, viewer, "household", { from: months[0], to }),
    categoryChoices(db, viewer),
  ]);
  const report = moneyReport({
    range,
    months,
    since: counts.since,
    sums,
    byCategory,
    sources,
    categories,
  });
  const asked = one(search.month);
  const initial = report.months.some((month) => month.key === asked)
    ? asked!
    : report.months.at(-1)!.key;

  return (
    <>
      <Header range={range} />
      <MoneyInOutReport report={report} initial={initial} />
    </>
  );
}
