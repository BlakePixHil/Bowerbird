import { PageHeader, SyncWarningBanner } from "@/components/shell";
import { ButtonLink, EmptyState } from "@/components/ui";

export default function HomePage() {
  return (
    <>
      <PageHeader title="Home" home />
      <SyncWarningBanner />
      <EmptyState
        icon="home"
        title="Your month will show up here"
        action={
          <ButtonLink href="/import" icon="upload" variant="primary">
            Import a bank file
          </ButtonLink>
        }
      >
        Bring in your transactions and Home will show what&apos;s left to spend, how you&apos;re
        tracking against your budgets and what came in and went out.
      </EmptyState>
    </>
  );
}
