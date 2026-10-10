import type { Metadata } from "next";
import { PageHeader } from "@/components/shell";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Money in, money out" };

export default function MoneyInOutPage() {
  return (
    <>
      <PageHeader
        title="Money in, money out"
        back={{ href: "/reports", label: "reports" }}
        parent={{ href: "/reports", label: "Reports" }}
        actions={null}
      />
      <EmptyState icon="in-out" title="Nothing to compare yet">
        Once a month of transactions is in, this shows what came in, what went out and what you
        kept.
      </EmptyState>
      <div id="left-over">
        <EmptyState icon="box" title="What's left over">
          The share of your pay you kept each month will show here.
        </EmptyState>
      </div>
    </>
  );
}
