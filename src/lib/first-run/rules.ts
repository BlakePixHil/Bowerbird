/*
 * The first run (project 06): straight after making a passkey, the Owner is walked through
 * 1 Welcome, 2 How transactions get in, 3 When you're paid, and 4 You're set, which is Home in its
 * first week. Each member row keeps the step they stopped at, so setup picks up there; null means
 * finished, as it is for everyone who set up before the first run existed.
 */

/** The steps with pages of their own. Step 4 is Home. */
export const FIRST_RUN_STEPS = ["welcome", "bring", "payday"] as const;
export type FirstRunStep = (typeof FIRST_RUN_STEPS)[number];

/** Where each step lives. */
export const FIRST_RUN_PATHS: Record<FirstRunStep, string> = {
  welcome: "/start/welcome",
  bring: "/start/bring-in",
  payday: "/start/payday",
};

/** The longest name and household name, the same as setting up. */
export const NAME_MAX = 60;

/**
 * Where the first run picks up: the step saved, except that once transactions are in, bringing
 * them in is done and it's on to payday. Null once setup is finished.
 */
export function resumeAt(
  saved: "welcome" | "bring" | null,
  transactions: number,
): FirstRunStep | null {
  if (saved === "bring" && transactions > 0) return "payday";
  return saved;
}

/** A name as it's kept: spaces tidied, or null when it's empty or too long. */
export function tidyName(text: string): string | null {
  const name = text.trim().replace(/\s+/g, " ");
  return name && name.length <= NAME_MAX ? name : null;
}

export type WelcomeSaved =
  { ok: true } | { ok: false; field: "name" | "household" | null; error: string };
