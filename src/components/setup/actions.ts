"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { finishFirstRun, FIRST_RUN_PATHS, saveWelcome, type WelcomeSaved } from "@/lib/first-run";

/** Step 1: saves the person's name and the household's, then on to step 2. */
export async function saveWelcomeStep(input: {
  name: unknown;
  household: unknown;
}): Promise<WelcomeSaved> {
  const me = await requireMember();
  if (typeof input.name !== "string" || typeof input.household !== "string")
    return { ok: false, field: null, error: "That didn't make sense. Try again." };
  const saved = await saveWelcome(
    getDb(),
    {
      userId: me.user.id,
      memberId: me.member.id,
      householdId: me.household.id,
      owner: me.member.role === "owner",
    },
    { name: input.name, household: input.household },
  );
  if (saved.ok) redirect(FIRST_RUN_PATHS.bring);
  return saved;
}

/** Step 3 is saved, so setup is finished: on to Home in its first week, which is step 4. */
export async function finishFirstRunStep(): Promise<void> {
  const me = await requireMember();
  await finishFirstRun(getDb(), me.member.id);
  redirect("/");
}
