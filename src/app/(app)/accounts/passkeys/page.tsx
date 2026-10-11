import type { Metadata } from "next";
import { passkeyItems } from "@/components/accounts/load";
import { Passkeys } from "@/components/accounts/Passkeys";
import { getShell, PageHeader } from "@/components/shell";
import { Card } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import styles from "@/components/accounts/Accounts.module.css";

export const metadata: Metadata = { title: "Your passkeys" };

/** Your passkeys on their own page, for the row on a phone's Accounts and sharing. */
export default async function PasskeysPage() {
  const shell = await getShell();
  const me = await requireMember();
  const keys = await passkeyItems(getDb(), me.user.id, shell.timeZone);
  return (
    <>
      <PageHeader
        title="Your passkeys"
        back={{ href: "/accounts", label: "Accounts and sharing" }}
        parent={{ href: "/accounts", label: "Accounts and sharing" }}
        intro="Add one on each phone or computer you use, so any of them can sign in with Face ID, a fingerprint or a screen lock."
        large
        actions={null}
      />
      <Card as="section" aria-label="Your passkeys" className={styles.keysCard}>
        <Passkeys keys={keys} />
      </Card>
    </>
  );
}
