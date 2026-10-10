import type { Metadata } from "next";
import { PageHeader } from "@/components/shell";
import { ButtonLink, EmptyState, IconButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <>
      <PageHeader
        title="Activity"
        phoneActions={<IconButtonLink href="/import" icon="upload" label="Import a bank file" />}
      />
      <EmptyState
        icon="list"
        title="No transactions yet"
        action={
          <ButtonLink href="/import" icon="upload" variant="primary">
            Import a bank file
          </ButtonLink>
        }
      >
        Every transaction from your accounts will be listed here, newest first, with the category it
        counts toward.
      </EmptyState>
    </>
  );
}
