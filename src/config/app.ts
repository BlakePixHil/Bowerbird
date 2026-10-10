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
  { name: "Groceries", kind: "spending" },
  { name: "Eating out", kind: "spending" },
  { name: "Transport", kind: "spending" },
  { name: "Fuel", kind: "spending" },
  { name: "Bills and utilities", kind: "spending" },
  { name: "Housing", kind: "spending" },
  { name: "Insurance", kind: "spending" },
  { name: "Health", kind: "spending" },
  { name: "Shopping", kind: "spending" },
  { name: "Entertainment", kind: "spending" },
  { name: "Subscriptions", kind: "spending" },
  { name: "Travel", kind: "spending" },
  { name: "Gifts", kind: "spending" },
  { name: "Income", kind: "income" },
  { name: "Transfers", kind: "transfer" },
  { name: "Other", kind: "spending" },
] as const satisfies readonly { name: string; kind: "spending" | "income" | "transfer" }[];
