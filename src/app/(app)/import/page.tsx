import type { Metadata } from "next";
import { PageHeader } from "@/components/shell";
import { EmptyState, Pill } from "@/components/ui";

export const metadata: Metadata = { title: "Import a bank file" };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import a bank file"
        back={{ href: "/accounts", label: "accounts and sharing" }}
        parent={{ href: "/accounts", label: "Accounts and sharing" }}
        actions={<Pill tone="good">Free, always works</Pill>}
      />
      <EmptyState icon="upload" title="Importing files is on its way">
        On your bank&apos;s website, look for Export or Download transactions and pick CSV, OFX or
        QIF. You&apos;ll bring that file in here.
      </EmptyState>
    </>
  );
}
