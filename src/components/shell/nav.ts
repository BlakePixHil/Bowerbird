import { FEATURES, type Feature, type FeatureFlags } from "@/config/features";
import type { NavLink } from "@/components/ui";

/** A place in the app's navigation. Entries with a feature only show once that feature is on. */
export type NavEntry = NavLink & { feature?: Feature };

/**
 * A report and its everyday question (01 · Product brief, Plain words). `short` is the question
 * as its card on the Reports page asks it, from the board "Reports".
 */
export type ReportEntry = NavEntry & { question: string; short: string };

/** The phone's bottom tab bar, and the top of the desktop sidebar. */
export const TABS: readonly NavEntry[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/activity", label: "Activity", icon: "list" },
  { href: "/budgets", label: "Budgets", icon: "pie" },
  { href: "/goals", label: "Goals", icon: "flag-goal", feature: "goals" },
  { href: "/reports", label: "Reports", icon: "bars" },
];

/**
 * The reports, in the sidebar's order. What's left over is a section of Money in, money out, and
 * Plan vs reality a section of Budgets, so those two link to the section's id on that page.
 */
export const REPORTS: readonly ReportEntry[] = [
  {
    href: "/reports/money-in-out",
    label: "Money in, money out",
    icon: "in-out",
    question: "Did we earn more than we spent this month?",
    short: "Did we earn more than we spent?",
  },
  {
    href: "/reports/money-in-out#left-over",
    label: "What's left over",
    icon: "box",
    question: "How much did we keep, and what share of our pay is that?",
    short: "How much did we keep?",
  },
  {
    href: "/reports/own-and-owe",
    label: "What we own and owe",
    icon: "scales",
    feature: "ownAndOwe",
    question: "Are we better off than last month and last year?",
    short: "Are we better off?",
  },
  {
    href: "/reports/until-payday",
    label: "Until payday",
    icon: "calendar",
    feature: "untilPayday",
    question: "Will the account stay above zero once the bills come out?",
    short: "Will we stay above zero?",
  },
  {
    href: "/reports/the-plan",
    label: "The plan",
    icon: "clipboard",
    feature: "thePlan",
    question: "What do we expect to earn and spend this year?",
    short: "What do we expect to earn and spend this year?",
  },
  {
    href: "/budgets#plan-vs-reality",
    label: "Plan vs reality",
    icon: "target",
    question: "Where did we overspend or underspend, and by how much?",
    short: "Where did we overspend?",
  },
  {
    href: "/reports/big-buys",
    label: "Big buys and trips",
    icon: "suitcase",
    feature: "bigBuys",
    question: "What large purchases are coming, and are we saving for them?",
    short: "Are we saving for them?",
  },
  {
    href: "/reports/investments",
    label: "Our investments",
    icon: "trend",
    feature: "investments",
    question: "How are our shares doing, and who owns what?",
    short: "How are they doing?",
  },
  {
    href: "/reports/check-in",
    label: "Monthly check-in",
    icon: "check-circle",
    feature: "checkIn",
    question: "What changed, what's coming, and what do we adjust?",
    short: "What changed, and what do we adjust?",
  },
];

/** The bottom of the desktop sidebar. On a phone these open from the avatar. */
export const SETTINGS: readonly NavEntry[] = [
  { href: "/categories", label: "Categories and rules", icon: "tag" },
  { href: "/accounts", label: "Accounts and sharing", icon: "bank" },
];

/** The entries whose feature is on, or that need none. */
export function visible<T extends NavEntry>(
  entries: readonly T[],
  features: FeatureFlags = FEATURES,
): T[] {
  return entries.filter((entry) => entry.feature === undefined || features[entry.feature]);
}
