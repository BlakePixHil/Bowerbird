import { ICONS, type DataColour, type IconName } from "@/components/ui";
import type { CategorySummary, RuleRow } from "@/lib/access";
import { formatMoney, parts, type PlainDate } from "@/lib/money";
import { categoryColour } from "@/lib/sorting/colour";

/** The three parts of the page, from the board's segmented control. */
export const TABS = [
  { value: "categories", label: "Categories" },
  { value: "rules", label: "Rules" },
  { value: "shops", label: "Shop names" },
] as const;
export type Tab = (typeof TABS)[number]["value"];

export const tabOf = (value: string | null | undefined): Tab =>
  TABS.find((tab) => tab.value === value)?.value ?? "categories";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "October" for a date in October. */
export const monthName = (date: PlainDate) => MONTHS[parts(date).month - 1];

/** "OCT", for the chart's labels. */
export const monthShort = (date: PlainDate) => monthName(date).slice(0, 3).toUpperCase();

/** Whole dollars, as the board shows them: $2,350. */
export const dollars = (cents: number) => formatMoney(cents, { decimals: "never", sign: "never" });

/** A category's colour: its slot or grey, with Income always the money-in green. */
export function colourOf(category: Pick<CategorySummary, "kind" | "colourSlot">): DataColour {
  return category.kind === "income" ? "pos" : categoryColour(category);
}

export const iconOf = (category: { icon: string | null }): IconName =>
  category.icon && Object.hasOwn(ICONS, category.icon) ? (category.icon as IconName) : "tag";

/** A part of spending in words: "42%", "under 1%", or nothing when there's none. */
export function shareText(cents: number, total: number): string {
  if (cents <= 0 || total <= 0) return "";
  const share = (cents / total) * 100;
  return share < 1 ? "under 1%" : `${Math.round(share)}%`;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-AU")} ${n === 1 ? one : many}`;

export const transactionsText = (n: number) => plural(n, "transaction");
export const rulesText = (n: number) => plural(n, "rule");

/** The grey line under a category: "4 transactions · 2 rules", or "Nothing yet, usually $870". */
export function metaLine(category: Pick<CategorySummary, "count" | "rules" | "usual">): string {
  const what =
    category.count > 0
      ? transactionsText(category.count)
      : category.usual > 0
        ? `Nothing yet, usually ${dollars(category.usual)}`
        : "Nothing yet";
  return category.rules > 0 ? `${what} · ${rulesText(category.rules)}` : what;
}

/** "Spending", "Income" or "Not counted", for the desktop table's Kind column. */
export const kindName = (kind: CategorySummary["kind"]) =>
  kind === "spending" ? "Spending" : kind === "income" ? "Income" : "Not counted";

/** What the money in a category is called: spent, came in or moved. */
export const moneyWord = (kind: CategorySummary["kind"]) =>
  kind === "spending" ? "Spent" : kind === "income" ? "Came in" : "Moved";

/** How a category got its colour, under the swatches. */
export function colourNote(
  category: Pick<CategorySummary, "name" | "kind" | "colourSlot">,
): string {
  if (category.kind === "income")
    return "Income always uses the money-in green. Only the top seven spending categories have a colour of their own.";
  if (category.colourSlot)
    return `The top seven categories keep their colour everywhere, so ${category.name} always looks the same in every chart.`;
  return `${category.name} shares grey with the smaller categories. Only the top seven keep a colour of their own.`;
}

/** The words before the shop or text in a rule. */
export const ruleWhen = (rule: Pick<RuleRow, "shop">) =>
  rule.shop ? "When the shop is" : "When it says";

/** What the rule matches: the shop's name or the bank text. */
export const ruleMatch = (rule: Pick<RuleRow, "shop" | "matchText">) =>
  rule.shop?.name ?? rule.matchText ?? "";

/** "All 12 rules are on. They've sorted 104 transactions for you." */
export function rulesSummary(list: readonly Pick<RuleRow, "enabled" | "sorted">[]): string {
  if (list.length === 0) return "No rules yet.";
  const on = list.filter((rule) => rule.enabled).length;
  const sorted = transactionsText(list.reduce((sum, rule) => sum + rule.sorted, 0));
  if (list.length === 1) return `Your rule is ${on ? "on" : "off"}. It's sorted ${sorted} for you.`;
  const state =
    on === list.length
      ? `All ${list.length} rules are on.`
      : `${on} of ${list.length} rules are on.`;
  return `${state} They've sorted ${sorted} for you.`;
}
