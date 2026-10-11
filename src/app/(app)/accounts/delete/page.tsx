import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeleteHousehold } from "@/components/accounts/DeleteHousehold";
import { getShell, PageHeader } from "@/components/shell";
import { Card } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import styles from "@/components/accounts/Accounts.module.css";

export const metadata: Metadata = { title: "Delete the household" };

/** Delete the household on its own page, for the row on a phone's Accounts and sharing. */
export default async function DeletePage() {
  const shell = await getShell();
  const me = await requireMember();
  if (me.member.role !== "owner") redirect("/accounts");
  return (
    <>
      <PageHeader
        title="Delete the household"
        back={{ href: "/accounts", label: "Accounts and sharing" }}
        parent={{ href: "/accounts", label: "Accounts and sharing" }}
        actions={null}
      />
      <Card as="section" aria-label="Delete the household" className={styles.deleteCard}>
        <DeleteHousehold
          householdName={shell.householdName}
          liveSync={shell.live.connections > 0}
          open
        />
      </Card>
    </>
  );
}
