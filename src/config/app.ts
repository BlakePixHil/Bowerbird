/**
 * The app's name lives here and nowhere else in the code.
 * If it changes, update this file, the logo wordmark and 01 · Product brief in Linear.
 */
export const APP_NAME = "Bowerbird";

/** The name under the icon on a phone's Home Screen. Keep it short so it never gets cut off. */
export const APP_SHORT_NAME = "Bowerbird";

/** Days, weeks, months and paydays are worked out in the household's time zone. This is the default. */
export const DEFAULT_TIMEZONE = "Australia/Sydney";

/**
 * Every household starts with these categories (project 03 · Sorting transactions). Income is kind
 * income, Transfers is kind transfer, and the rest are spending.
 */
export const STARTING_CATEGORIES = [
  { name: "Groceries", kind: "spending", icon: "cart" },
  { name: "Eating out", kind: "spending", icon: "food" },
  { name: "Transport", kind: "spending", icon: "car" },
  { name: "Fuel", kind: "spending", icon: "fuel" },
  { name: "Bills and utilities", kind: "spending", icon: "bolt" },
  { name: "Housing", kind: "spending", icon: "house" },
  { name: "Insurance", kind: "spending", icon: "umbrella" },
  { name: "Health", kind: "spending", icon: "heart" },
  { name: "Shopping", kind: "spending", icon: "bag" },
  { name: "Entertainment", kind: "spending", icon: "film" },
  { name: "Subscriptions", kind: "spending", icon: "repeat" },
  { name: "Travel", kind: "spending", icon: "plane" },
  { name: "Gifts", kind: "spending", icon: "gift" },
  { name: "Income", kind: "income", icon: "income" },
  { name: "Transfers", kind: "transfer", icon: "transfer" },
  { name: "Other", kind: "spending", icon: "other" },
] as const satisfies readonly {
  name: string;
  kind: "spending" | "income" | "transfer";
  /** A name from the inline icon set (src/components/ui/icons.ts). */
  icon: string;
}[];

/**
 * Live sync goes through Redbark, a SimpleFIN provider over the Consumer Data Right. It's optional
 * and paid to Redbark (agreed by Blake, see 04 · Decisions and cost rules in Linear).
 */
export const LIVE_SYNC_PROVIDER = {
  name: "Redbark",
  url: "https://redbark.com",
  plan: "Developer plan",
  price: "A$16 a month",
  connections: 6,
  /** How long a bank's consent lasts from when it's made (redbark.com/docs/consents). */
  consentMonths: 12,
} as const;
