import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FirstSync } from "@/components/connect/FirstSync";
import { getShell, PageHeader } from "@/components/shell";
import { Pill } from "@/components/ui";
import { viewerOf } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { firstSyncProgress } from "@/lib/banks/live";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "First sync" };

/** Live sync step 3: the first sync bringing in each picked account's history. */
export default async function FirstSyncPage({
  searchParams,
}: {
  searchParams: Promise<{ connection?: string | string[] }>;
}) {
  // The frame carries on a sync that stopped part way, so the progress read after it is current.
  await getShell();
  const me = await requireMember();
  const viewer = viewerOf(me);
  const { connection: id } = await searchParams;
  const progress = typeof id === "string" ? await firstSyncProgress(getDb(), viewer, id) : null;
  if (!progress) notFound();
  if (progress.accounts.length === 0)
    redirect(`/connect/accounts?connection=${progress.connectionId}`);

  return (
    <>
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
      <FirstSync initial={progress} inSetup={me.member.setupStep !== null} />
    </>
  );
}
