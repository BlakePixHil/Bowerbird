import type { Metadata } from "next";
import { ImportFlow, type RecentShown } from "@/components/import/ImportFlow";
import { accountIcon, accountMeta } from "@/components/import/labels";
import type { AccountChoice } from "@/components/import/parts";
import { getShell, PageHeader } from "@/components/shell";
import { Pill } from "@/components/ui";
import { viewerOf } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { importableAccounts, recentImports } from "@/lib/banks/imports";
import { getDb } from "@/lib/db";
import { formatShortDate, todayIn } from "@/lib/money";

export const metadata: Metadata = { title: "Import a bank file" };

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string | string[] }>;
}) {
  const shell = await getShell();
  const me = await requireMember();
  const viewer = viewerOf(me);
  const db = getDb();
  const [mine, recent, params] = await Promise.all([
    importableAccounts(db, viewer),
    recentImports(db, viewer),
    searchParams,
  ]);

  const accounts: AccountChoice[] = mine.map((account) => ({
    id: account.id,
    name: account.name,
    meta: accountMeta(account),
    icon: accountIcon(account),
  }));
  const shown: RecentShown[] = recent.map((item) => ({
    id: item.id,
    filename: item.filename,
    meta: `${item.accountName} · ${formatShortDate(todayIn(shell.timeZone, item.createdAt))}`,
    rows: item.rows,
    skipped: item.skipped,
  }));

  return (
    <>
      <PageHeader
        title="Import a bank file"
        phone={false}
        parent={{ href: "/accounts", label: "Accounts and sharing" }}
        intro="Drop a CSV, OFX or QIF onto the account it came from. Works with or without live sync."
        actions={
          <>
            <Pill tone="good">Free, always works</Pill>
            <Pill tone="quiet" icon="eye">
              Read-only, never moves money
            </Pill>
          </>
        }
      />
      <ImportFlow
        accounts={accounts}
        recent={shown}
        start={typeof params.account === "string" ? params.account : null}
        todayLabel={formatShortDate(shell.today)}
        inSetup={me.member.setupStep !== null}
      />
    </>
  );
}
