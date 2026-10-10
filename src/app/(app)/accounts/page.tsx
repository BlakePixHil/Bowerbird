import type { Metadata } from "next";
import { getShell, PageHeader } from "@/components/shell";
import { ButtonLink, EmptyState, Pill, Tag } from "@/components/ui";

export const metadata: Metadata = { title: "Accounts and sharing" };

export default async function AccountsPage() {
  const shell = await getShell();
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
      <EmptyState
        icon="bank"
        title="No accounts yet"
        action={
          <ButtonLink href="/import" icon="upload" variant="primary">
            Import a bank file
          </ButtonLink>
        }
      >
        Import a file from your bank to add your first account. The app only reads your balances and
        transactions. It never moves money.
      </EmptyState>
    </>
  );
}
