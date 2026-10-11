/**
 * Features from later phases, and whether each one is switched on. While a feature is off, its nav
 * items, report cards and settings rows stay hidden and its pages don't exist. The ticket that
 * builds a feature adds its pages and turns it on here in the same pull request.
 *
 * Everything in phase 1 (Home, Activity, Budgets, Reports, Money in money out, What's left over,
 * Plan vs reality, Categories and rules, Accounts and sharing) is always on, so it isn't listed.
 */
export const FEATURES = {
  /** Phase 2, project 08 · Bills, alerts and Until payday. */
  untilPayday: false,
  /** Phase 2, project 08 · Bills, alerts and Until payday: alerts on the phone and computer. */
  notifications: false,
  /** Phase 3, project 09 · Goals and trips. */
  goals: false,
  /** Phase 3, project 09 · Goals and trips. */
  bigBuys: false,
  /** Phase 3, project 10 · Net worth and investments. */
  ownAndOwe: false,
  /** Phase 3, project 10 · Net worth and investments. */
  investments: false,
  /** Phase 3, project 11 · Monthly check-in and the plan. */
  thePlan: false,
  /** Phase 3, project 11 · Monthly check-in and the plan. */
  checkIn: false,
} as const satisfies Record<string, boolean>;

export type Feature = keyof typeof FEATURES;

export type FeatureFlags = Readonly<Record<Feature, boolean>>;
