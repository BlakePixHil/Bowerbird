import { cache } from "react";
import { getShell } from "@/components/shell";
import { activityCounts, viewerOf } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { resumeAt } from "@/lib/first-run";
import type { SetupSoFar } from "./steps";

/** What every first-run page needs: who's setting up, where they're up to, and what's in so far. */
export const getSetup = cache(async () => {
  const shell = await getShell();
  const me = await requireMember();
  const viewer = viewerOf(me);
  const counts = await activityCounts(getDb(), viewer);
  const so: SetupSoFar = {
    name: shell.member.name,
    household: me.household.name,
    live: shell.live.connections,
    transactions: counts.all,
  };
  return { shell, me, viewer, counts, so, at: resumeAt(me.member.setupStep, counts.all) };
});
