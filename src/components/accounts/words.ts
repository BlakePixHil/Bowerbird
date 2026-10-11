import type { OwnAccount } from "@/lib/access";

/** "Owner · signs in with Face ID". Partners show as Member, as on the boards. */
export function roleLine(role: "owner" | "partner", signsInWith: string): string {
  return `${role === "owner" ? "Owner" : "Member"} · signs in with ${signsInWith}`;
}

/** "Yours · Westpac · live sync", or "Joint · ANZ · bank files · not in budgets". */
export function accountLine(
  account: Pick<OwnAccount, "isJoint" | "institution" | "live" | "manual" | "includeInBudgets">,
): string {
  const source = account.live ? "live sync" : account.manual ? "entered by hand" : "bank files";
  return [
    account.isJoint ? "Joint" : "Yours",
    account.institution,
    source,
    account.includeInBudgets ? null : "not in budgets",
  ]
    .filter(Boolean)
    .join(" · ");
}

const rowsWord = (n: number) => `${n.toLocaleString("en-AU")} ${n === 1 ? "row" : "rows"}`;

/** "westpac-sep.csv, 214 rows, 12 skipped because they were already here". */
export function importLine(last: { filename: string; rows: number; skipped: number }): string {
  const skipped =
    last.skipped === 0
      ? ""
      : last.skipped === 1
        ? ", 1 skipped because it was already here"
        : `, ${last.skipped.toLocaleString("en-AU")} skipped because they were already here`;
  return `${last.filename}, ${rowsWord(last.rows)}${skipped}`;
}

/** "15 categories, 12 rules", for the Categories and rules row. */
export function categoriesLine(categories: number, rules: number): string {
  const c = `${categories} ${categories === 1 ? "category" : "categories"}`;
  const r = rules === 0 ? "no rules yet" : `${rules} ${rules === 1 ? "rule" : "rules"}`;
  return `${c}, ${r}, cleaned-up shop names`;
}
