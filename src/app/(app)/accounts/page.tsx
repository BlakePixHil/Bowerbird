import type { Metadata } from "next";
import { LiveSyncCard } from "@/components/accounts/LiveSyncCard";
import { getShell, PageHeader } from "@/components/shell";
import { AddPasskeyButton, SignOutButton } from "@/components/auth/AccountActions";
import { ButtonLink, Card, EmptyState, ListRow, Pill, Tag, Tile } from "@/components/ui";
import { viewerOf, visibleAccounts } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { passkeyList } from "@/lib/auth/passkeys";
import { getDb } from "@/lib/db";
import { formatShortDate, todayIn } from "@/lib/money";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Accounts and sharing" };

export default async function AccountsPage() {
  const shell = await getShell();
  const me = await requireMember();
  const db = getDb();
  const [keys, seen] = await Promise.all([
    passkeyList(db, me.user.id),
    visibleAccounts(db, viewerOf(me)),
  ]);
  const hasAccounts = seen.some((account) => account.access !== "hidden" && !account.archived);
  const day = (at: Date) => formatShortDate(todayIn(shell.timeZone, at));
  return (
    <>
      <PageHeader
        title="Accounts and sharing"
        back={{ href: "/", label: "home" }}
        actions={
          <>
            <Pill tone="quiet" icon="shield">
              Read-only, never moves money
            </Pill>
            <Tag>{shell.householdName}</Tag>
          </>
        }
      />
      <LiveSyncCard />
      {!hasAccounts && (
        <EmptyState
          icon="bank"
          title="No accounts yet"
          action={
            <>
              <ButtonLink href="/import" icon="upload" variant="primary">
                Import a bank file
              </ButtonLink>
              <ButtonLink href="/connect" icon="sync">
                Connect live sync
              </ButtonLink>
            </>
          }
        >
          Import a file from your bank, or connect live sync, to add your first account. The app
          only reads your balances and transactions. It never moves money.
        </EmptyState>
      )}
      <Card as="section" aria-labelledby="passkeys-title" className={styles.passkeys}>
        <div>
          <h2 id="passkeys-title" className="h2">
            Your passkeys
          </h2>
          <p className={styles.text}>
            Add one on each phone or computer you use, so any of them can sign in with Face ID, a
            fingerprint or a screen lock.
          </p>
        </div>
        <ul className={styles.keys}>
          {keys.map((key) => (
            <ListRow
              key={key.id}
              as="li"
              leading={<Tile icon="passkey" />}
              title={key.label ?? "Passkey"}
              detail={`Added ${day(key.createdAt)} · ${key.lastUsedAt ? `Last used ${day(key.lastUsedAt)}` : "Not used yet"}`}
            />
          ))}
        </ul>
        <div className={styles.row}>
          <AddPasskeyButton />
          <SignOutButton />
        </div>
      </Card>
    </>
  );
}
