import type { Metadata } from "next";
import { CategoryTabs, ManageCategories, monthName } from "@/components/categories";
import { getShell, PageHeader } from "@/components/shell";
import {
  categoryOverview,
  dayOfMonth,
  ruleList,
  shopList,
  tagChoices,
  viewerOf,
} from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatShortDate } from "@/lib/money";

export const metadata: Metadata = { title: "Categories and rules" };

export default async function CategoriesPage() {
  const shell = await getShell();
  const viewer = viewerOf(await requireMember());
  const db = getDb();
  const [overview, rules, shops, tags] = await Promise.all([
    categoryOverview(db, viewer, shell.today),
    ruleList(db, viewer),
    shopList(db, viewer),
    tagChoices(db, viewer),
  ]);
  const { day, of } = dayOfMonth(shell.today);
  const month = monthName(shell.today);

  return (
    <>
      <PageHeader
        title="Categories and rules"
        back={{ href: "/accounts", label: "accounts and sharing" }}
        line={`${formatShortDate(shell.today)} · ${month} so far, day ${day} of ${of}`}
        actions={<CategoryTabs place="desktop" />}
      />
      <ManageCategories
        overview={overview}
        rules={rules}
        shops={shops}
        tags={tags}
        dayLine={`Day ${day} of ${of}`}
        today={shell.today}
        timeZone={shell.timeZone}
      />
    </>
  );
}
