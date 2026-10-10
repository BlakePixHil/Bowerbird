import type { Metadata } from "next";
import { PageHeader } from "@/components/shell";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Budgets" };

export default function BudgetsPage() {
  return (
    <>
      <PageHeader title="Budgets" actions={null} />
      <EmptyState icon="pie" title="No budgets yet">
        Set an amount for the things you spend on, for each pay cycle or month, and see whether
        you&apos;re on pace as it goes.
      </EmptyState>
      <div id="plan-vs-reality">
        <EmptyState icon="target" title="Plan vs reality">
          After your first full period, this compares what you spent in each category with what you
          planned.
        </EmptyState>
      </div>
    </>
  );
}
