import type { Metadata } from "next";
import { PaydaysEditor } from "@/components/paydays";
import { loadPaydays } from "@/components/paydays/load";
import { getShell, PageHeader } from "@/components/shell";
import { viewerOf } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "When you're paid" };

export default async function PaydaysPage() {
  const shell = await getShell();
  const viewer = viewerOf(await requireMember());
  const pay = await loadPaydays(getDb(), viewer, shell.today);

  return (
    <>
      <PageHeader
        title="When are you paid?"
        back={{ href: "/accounts", label: "accounts and sharing" }}
        parent={{ href: "/accounts", label: "Accounts and sharing" }}
        actions={null}
        intro={pay.intro}
      />
      <PaydaysEditor
        today={shell.today}
        accounts={pay.accounts}
        saved={pay.saved}
        budgetsRun={pay.budgetsRun}
        suggestions={pay.suggestions}
        person={{ initials: shell.member.initials, name: shell.member.name }}
        intro={pay.intro}
      />
    </>
  );
}
