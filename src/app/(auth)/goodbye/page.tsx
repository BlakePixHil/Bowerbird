import type { Metadata } from "next";
import { ForgetThisDevice } from "@/components/offline/ForgetThisDevice";
import { ButtonLink, Icon, LogoMark, Well } from "@/components/ui";
import { APP_NAME, LIVE_SYNC_PROVIDER as P } from "@/config/app";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Household deleted" };

/**
 * Where Delete the household ends. It holds nothing of anyone's, so it's open to everyone, and it
 * forgets the pages this device kept for reading offline. When the household had live sync, it
 * says to remove the banks in the provider too: deleting here only deletes this app's access link.
 */
export default async function GoodbyePage({
  searchParams,
}: {
  searchParams: Promise<{ live?: string | string[] }>;
}) {
  const live = (await searchParams).live === "1";
  return (
    <section aria-labelledby="goodbye-title" className={styles.card}>
      <LogoMark size={56} />
      <div className={styles.words}>
        <h1 id="goodbye-title" className="h1">
          Your household is deleted
        </h1>
        <p className="sub">
          Everything in it is gone from {APP_NAME} for good: accounts, transactions, budgets, rules
          and passkeys. Everyone in it is signed out.
        </p>
      </div>
      {live && (
        <Well className={styles.live}>
          <span className={styles.liveHead}>
            <Icon name="alert" size="sm" />
            One more step in {P.name}
          </span>
          <p className="small sub">
            {APP_NAME}&apos;s access link is deleted, but {P.name} still has your banks connected.
            Sign in to {P.name} to remove them, and cancel the plan there if you don&apos;t need it
            any more.
          </p>
          <ButtonLink
            href={P.url}
            target="_blank"
            rel="noopener noreferrer"
            icon="external"
            aria-label={`Open ${P.name} (opens in a new tab)`}
          >
            Open {P.name}
          </ButtonLink>
        </Well>
      )}
      <ButtonLink href="/sign-in" variant="primary" size="lg" block>
        Start again
      </ButtonLink>
      <ForgetThisDevice />
    </section>
  );
}
