"use client";

import type { CategoryOverview, RuleRow, ShopRow, TagRef } from "@/lib/access";
import type { PlainDate } from "@/lib/money";
import { CategoriesTab } from "./CategoriesTab";
import { CategoryTabs } from "./CategoryTabs";
import styles from "./Manage.module.css";
import { useManageParams } from "./params";
import { RulesTab } from "./RulesTab";
import { ShopsTab } from "./ShopsTab";

/** Categories and rules: one page, three parts, picked by the tabs. */
export function ManageCategories({
  overview,
  rules,
  shops,
  tags,
  dayLine,
  today,
  timeZone,
}: {
  overview: CategoryOverview;
  rules: readonly RuleRow[];
  shops: readonly ShopRow[];
  tags: readonly TagRef[];
  dayLine: string;
  today: PlainDate;
  timeZone: string;
}) {
  const { tab } = useManageParams();
  return (
    <div className={styles.page}>
      <CategoryTabs place="phone" />
      {tab === "categories" && (
        <CategoriesTab overview={overview} rules={rules} dayLine={dayLine} />
      )}
      {tab === "rules" && (
        <RulesTab
          rules={rules}
          categories={overview.categories}
          tags={tags}
          today={today}
          timeZone={timeZone}
        />
      )}
      {tab === "shops" && <ShopsTab shops={shops} today={today} />}
    </div>
  );
}
