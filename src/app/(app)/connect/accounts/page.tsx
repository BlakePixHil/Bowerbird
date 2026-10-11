import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PickAccounts } from "@/components/connect/PickAccounts";
import { PhoneTop, StepRail } from "@/components/connect/parts";
import { getShell, PageHeader } from "@/components/shell";
import { ButtonLink, Card, Pill, WarningBanner } from "@/components/ui";
import { LIVE_SYNC_PROVIDER } from "@/config/app";
import { otherMembers, viewerOf } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { ownConnection } from "@/lib/banks/connections";
import { listLiveAccounts } from "@/lib/banks/live";
import { getDb } from "@/lib/db";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Pick accounts" };

/** Live sync step 2: pick the accounts to bring in and who can see each. */
export default async function PickAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ connection?: string | string[] }>;
}) {
  await getShell();
  const viewer = viewerOf(await requireMember());
  const { connection: id } = await searchParams;
  const db = getDb();
  const connection = typeof id === "string" ? await ownConnection(db, viewer, id) : null;
  if (!connection) notFound();

  // On your own computer a pretend SimpleFIN server can run on localhost; never on Vercel.
  const allowLocal = process.env.NODE_ENV === "development";
  const [list, others] = await Promise.all([
    listLiveAccounts(db, viewer, connection.id, { allowLocal }),
    otherMembers(db, viewer),
  ]);
  const partner = others.length === 1 ? others[0].name : others.length > 1 ? "Everyone else" : null;

  const header = (
    <PageHeader
      title="Connect live sync"
      phone={false}
      parent={{ href: "/accounts", label: "Accounts and sharing" }}
      actions={
        <Pill tone="quiet" icon="eye">
          Read-only, never moves money
        </Pill>
      }
    />
  );

  if (list.ok && list.accounts.length > 0)
    return (
      <>
        {header}
        <PickAccounts connectionId={connection.id} accounts={list.accounts} partner={partner} />
      </>
    );

  const here = `/connect/accounts?connection=${connection.id}`;
  return (
    <>
      {header}
      <div className={styles.page}>
        <div className={styles.phoneTop}>
          <PhoneTop step={2} back={{ href: "/accounts", label: "Back to accounts and sharing" }} />
        </div>
        <div className={styles.rail}>
          <StepRail at="pick" />
        </div>
        <Card as="section" className={styles.card} aria-labelledby="pick-problem">
          <h2 id="pick-problem" className="h2">
            {list.ok ? "No accounts came through" : "Couldn’t read your accounts"}
          </h2>
          {list.ok ? (
            <p className="sub">
              The setup token worked, but {LIVE_SYNC_PROVIDER.name} isn’t sharing any accounts yet.
              Check which accounts you approved there, then try again.
            </p>
          ) : (
            <WarningBanner title={list.error} />
          )}
          <div className={styles.actions}>
            {!list.ok && list.reconnect ? (
              <ButtonLink href="/connect" variant="primary">
                Connect live sync again
              </ButtonLink>
            ) : (
              <ButtonLink href={here} variant="primary">
                Try again
              </ButtonLink>
            )}
            <ButtonLink href="/import">Upload a file instead</ButtonLink>
          </div>
        </Card>
      </div>
    </>
  );
}
