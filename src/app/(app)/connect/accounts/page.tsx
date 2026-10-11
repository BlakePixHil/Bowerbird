import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StepRail } from "@/components/connect/parts";
import { getShell, PageHeader } from "@/components/shell";
import { ButtonLink, Card, Pill } from "@/components/ui";
import { LIVE_SYNC_PROVIDER } from "@/config/app";
import { viewerOf } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { ownConnection } from "@/lib/banks/connections";
import { getDb } from "@/lib/db";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Pick accounts" };

/** Live sync step 2: picking the accounts to bring in. For now it confirms the connection. */
export default async function PickAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ connection?: string | string[] }>;
}) {
  await getShell();
  const viewer = viewerOf(await requireMember());
  const { connection: id } = await searchParams;
  const connection = typeof id === "string" ? await ownConnection(getDb(), viewer, id) : null;
  if (!connection) notFound();

  return (
    <>
      <PageHeader
        title="Connect live sync"
        back={{ href: "/accounts", label: "accounts and sharing" }}
        parent={{ href: "/accounts", label: "Accounts and sharing" }}
        actions={
          <Pill tone="quiet" icon="eye">
            Read-only, never moves money
          </Pill>
        }
      />
      <div className={styles.page}>
        <div className={styles.rail}>
          <StepRail at="pick" />
        </div>
        <Card as="section" className={styles.card} aria-labelledby="connected-title">
          <Pill tone="good">Connected</Pill>
          <h2 id="connected-title" className="h2">
            Your banks are connected through {LIVE_SYNC_PROVIDER.name}
          </h2>
          <p className="sub">
            The setup token worked, and only an encrypted access link was kept. Next you pick which
            accounts to bring in and who can see each one.
          </p>
          <ButtonLink href="/accounts">Go to Accounts and sharing</ButtonLink>
        </Card>
      </div>
    </>
  );
}
