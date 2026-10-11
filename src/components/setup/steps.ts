import { LIVE_SYNC_PROVIDER } from "@/config/app";
import { FIRST_RUN_PATHS, type FirstRunStep } from "@/lib/first-run/rules";
import { formatShortDate, type PlainDate } from "@/lib/money";

/** The four steps of the first run, as the desktop rail shows them. The fourth is Home. */
export const RAIL = [
  { key: "welcome", title: "Welcome", later: "Your name and household" },
  { key: "bring", title: "Bring in your transactions", later: "Live sync or bank files" },
  { key: "payday", title: "Your payday", later: "When you’re paid" },
  { key: "done", title: "You’re set", later: "What’s ready and what’s next" },
] as const;

export type RailKey = (typeof RAIL)[number]["key"];

export type RailStep = {
  key: RailKey;
  n: number;
  title: string;
  /** "Now", what was done, or what the step is for. */
  sub: string;
  state: "done" | "now" | "later";
  /** Done steps and this one can be gone back to; nothing for later ones. */
  href: string | null;
};

/** What setup knows so far, for the words under the steps already done. */
export type SetupSoFar = {
  name: string;
  household: string;
  /** Live sync connections, and transactions in. */
  live: number;
  transactions: number;
};

/** "Blake, Our household", "Live sync with Redbark" or "Bank files". */
function doneWords(key: RailKey, so: SetupSoFar): string {
  if (key === "welcome") return `${so.name}, ${so.household}`;
  if (key === "bring")
    return so.live > 0 ? `Live sync with ${LIVE_SYNC_PROVIDER.name}` : "Bank files";
  return "Done";
}

/** The rail with this step current, the ones before it done and the rest still to come. */
export function railSteps(at: FirstRunStep, so: SetupSoFar): RailStep[] {
  const now = RAIL.findIndex((step) => step.key === at);
  return RAIL.map((step, i) => {
    const state = i < now ? "done" : i === now ? "now" : "later";
    return {
      key: step.key,
      n: i + 1,
      title: step.title,
      sub: state === "now" ? "Now" : state === "done" ? doneWords(step.key, so) : step.later,
      state,
      href: state === "later" || step.key === "done" ? null : FIRST_RUN_PATHS[step.key],
    };
  });
}

/** "Your transactions are in: 482 of them, back to Sat 11 Jul." */
export function transactionsInLine(count: number, since: PlainDate, today: PlainDate): string {
  const from = formatShortDate(since, { year: since.slice(0, 4) !== today.slice(0, 4) });
  return count === 1
    ? `Your first transaction is in, from ${from}.`
    : `Your transactions are in: ${count.toLocaleString("en-AU")} of them, back to ${from}.`;
}

/** "SAT 10 OCT · STEP 1 OF 4", over each step's title on desktop. */
export function stepLine(today: PlainDate, step: number): string {
  return `${formatShortDate(today)} · Step ${step} of ${RAIL.length}`.toUpperCase();
}
