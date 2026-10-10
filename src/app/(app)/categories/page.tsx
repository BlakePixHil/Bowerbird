import type { Metadata } from "next";
import { PageHeader } from "@/components/shell";
import { EmptyState } from "@/components/ui";
import { STARTING_CATEGORIES } from "@/config/app";

export const metadata: Metadata = { title: "Categories and rules" };

export default function CategoriesPage() {
  return (
    <>
      <PageHeader
        title="Categories and rules"
        back={{ href: "/accounts", label: "accounts and sharing" }}
        actions={null}
      />
      <EmptyState icon="tag" title="Your categories will be here">
        Every household starts with {STARTING_CATEGORIES.length} categories, like Groceries and
        Eating out. You&apos;ll be able to change them and add rules that sort transactions for you.
      </EmptyState>
    </>
  );
}
