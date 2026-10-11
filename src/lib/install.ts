import { and, eq, isNull, lt, or } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { members } from "@/lib/db/schema";

/** Install the app emails its address at most once in this many minutes. */
export const APP_LINK_MINUTES = 1;

/** Home's prompt to install the app waits until the person has had the app this many days. */
export const INSTALL_PROMPT_DAYS = 7;

/** Notes the first time the person opened the installed app. Later times change nothing. */
export async function noteInstalled(db: Db, memberId: string, now = new Date()): Promise<void> {
  await db
    .update(members)
    .set({ installedAt: now })
    .where(and(eq(members.id, memberId), isNull(members.installedAt)));
}

/** Notes that the person closed or followed Home's prompt, so it never shows again. */
export async function noteInstallPromptDone(
  db: Db,
  memberId: string,
  now = new Date(),
): Promise<void> {
  await db
    .update(members)
    .set({ installPromptDoneAt: now })
    .where(and(eq(members.id, memberId), isNull(members.installPromptDoneAt)));
}

/**
 * Takes the person's turn to be emailed the app's address. False when one went out in the last
 * minute, so a stuck button or a stolen session can't send email after email.
 */
export async function takeAppLinkTurn(
  db: Db,
  memberId: string,
  now = new Date(),
): Promise<boolean> {
  const since = new Date(now.getTime() - APP_LINK_MINUTES * 60_000);
  const taken = await db
    .update(members)
    .set({ appLinkSentAt: now })
    .where(
      and(
        eq(members.id, memberId),
        or(isNull(members.appLinkSentAt), lt(members.appLinkSentAt, since)),
      ),
    )
    .returning({ id: members.id });
  return taken.length > 0;
}

/**
 * Whether Home shows its one-time prompt to install the app: not before the first week is up, not
 * once it's been closed or followed, and never for someone who already uses the installed app.
 */
export function showsInstallPrompt(
  member: { joinedAt: Date; installedAt: Date | null; installPromptDoneAt: Date | null },
  now: Date,
): boolean {
  if (member.installedAt || member.installPromptDoneAt) return false;
  return now.getTime() - member.joinedAt.getTime() >= INSTALL_PROMPT_DAYS * 86_400_000;
}
