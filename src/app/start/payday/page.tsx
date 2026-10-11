import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PaydaysEditor } from "@/components/paydays";
import { loadPaydays } from "@/components/paydays/load";
import { finishFirstRunStep, getSetup, SetupFrame, transactionsInLine } from "@/components/setup";
import styles from "@/components/setup/Setup.module.css";
import { Pill } from "@/components/ui";
import { getDb } from "@/lib/db";
import { FIRST_RUN_PATHS } from "@/lib/first-run";

export const metadata: Metadata = { title: "When you're paid" };

/**
 * First run, step 3: what came in, then "When are you paid?". Continue saves the paydays and
 * finishes setup, which leaves Home in its first week: step 4.
 */
export default async function PaydayStepPage() {
  const { shell, viewer, counts, so, at } = await getSetup();
  if (!at) redirect("/");
  if (at === "welcome") redirect(FIRST_RUN_PATHS.welcome);
  const pay = await loadPaydays(getDb(), viewer, shell.today);
  return (
    <SetupFrame
      at="payday"
      today={shell.today}
      so={so}
      initials={shell.member.initials}
      back={FIRST_RUN_PATHS.bring}
      before={
        counts.all > 0 &&
        counts.since && (
          <Pill tone="good" className={styles.inPill}>
            {transactionsInLine(counts.all, counts.since, shell.today)}
          </Pill>
        )
      }
      title="When are you paid?"
      intro={pay.intro}
    >
      <PaydaysEditor
        today={shell.today}
        accounts={pay.accounts}
        saved={pay.saved}
        budgetsRun={pay.budgetsRun}
        suggestions={pay.suggestions}
        person={{ initials: shell.member.initials, name: shell.member.name }}
        submitLabel="Continue"
        onSaved={finishFirstRunStep}
        back={FIRST_RUN_PATHS.bring}
      />
    </SetupFrame>
  );
}
