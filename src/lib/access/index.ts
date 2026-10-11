/**
 * Who can see what. This is the only place that reads accounts, balances and transactions for a
 * member, and ESLint stops other code reading those tables directly (see eslint.config.mjs).
 * A feature that needs a new kind of read adds a helper here.
 */
export {
  accessTo,
  otherMembers,
  pickScope,
  scopeFor,
  viewerOf,
  visibleAccounts,
  VIEWS,
  whoseIs,
  type Access,
  type HiddenAccount,
  type Scope,
  type SeenAccount,
  type View,
  type Viewer,
  type VisibleAccount,
  type Whose,
} from "./accounts";
export {
  balancesFor,
  transactionsFor,
  type BalanceRange,
  type SeenBalance,
  type SeenTransaction,
  type TransactionFilters,
} from "./queries";
export {
  ACTIVITY_PAGE_ROWS,
  activityCounts,
  activityPage,
  countActivity,
  dailySpending,
  type ActivityCategory,
  type ActivityCounts,
  type ActivityFilters,
  type ActivityPage,
  type ActivityRow,
  type DailySpending,
  type SplitPart,
  type TagRef,
} from "./activity";
export {
  addTag,
  removeSplit,
  removeTag,
  saveNote,
  splitProblem,
  splitTransaction,
  tagChoices,
  type NoteSaved,
  type PartChoice,
  type SplitRemoved,
  type SplitSaved,
  type TagsSaved,
} from "./details";
export {
  categoriseTransaction,
  categoryChoices,
  sortShopAlways,
  type Categorised,
  type CategoryChoice,
  type ShopSorted,
} from "./categorise";
export { markAsTransfer, notATransfer, type TransferChanged } from "./transfers";
export {
  addCategory,
  CATEGORY_NAME_MAX,
  categoryOverview,
  dayOfMonth,
  deleteCategory,
  editCategory,
  HISTORY_MONTHS,
  mergeCategory,
  type CategoryChanged,
  type CategoryOverview,
  type CategorySummary,
} from "./categories";
export {
  changeRule,
  deleteRule,
  ruleList,
  shopList,
  type RuleChanged,
  type RuleRow,
  type ShopRow,
} from "./rules";
