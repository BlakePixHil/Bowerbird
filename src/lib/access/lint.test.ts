import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

async function problems(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((message) => message.ruleId);
}

describe("the lint rule that keeps money reads in src/lib/access", () => {
  it("stops pages and components importing the money tables", async () => {
    expect(
      await problems(
        "src/app/(app)/activity/page.tsx",
        'import { transactions } from "@/lib/db/schema";\nexport const t = transactions;\n',
      ),
    ).toContain("no-restricted-imports");
    expect(
      await problems(
        "src/components/home/Balances.tsx",
        'import { balances as b } from "../../lib/db/schema";\nexport const t = b;\n',
      ),
    ).toContain("no-restricted-imports");
    expect(
      await problems(
        "src/lib/budgets/spent.ts",
        'import * as schema from "@/lib/db/schema";\nexport const t = schema;\n',
      ),
    ).toContain("no-restricted-imports");
  }, 30_000);

  it("stops Drizzle's db.query reads of those tables", async () => {
    const code =
      "declare const db: { query: { accounts: { findMany(): void } } };\ndb.query.accounts.findMany();\n";
    expect(await problems("src/app/(app)/accounts/page.tsx", code)).toContain(
      "no-restricted-syntax",
    );
  });

  it("allows other tables, and the access, sync and database code", async () => {
    const users = 'import { users } from "@/lib/db/schema";\nexport const t = users;\n';
    expect(await problems("src/app/(app)/accounts/page.tsx", users)).toEqual([]);
    const money =
      'import { transactions } from "@/lib/db/schema";\nexport const t = transactions;\n';
    for (const file of [
      "src/lib/access/spending.ts",
      "src/lib/banks/simplefin/sync.ts",
      "src/lib/sorting/rules.ts",
      "src/lib/budgets/budgets.test.ts",
    ]) {
      expect(await problems(file, money), file).toEqual([]);
    }
  });
});
