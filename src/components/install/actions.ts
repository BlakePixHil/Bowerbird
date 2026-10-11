"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { requireMember } from "@/lib/auth";
import { sendAppLinkEmail } from "@/lib/auth/mail";
import { relyingParty } from "@/lib/auth/relying-party";
import { getDb } from "@/lib/db";
import { noteInstalled, noteInstallPromptDone, takeAppLinkTurn } from "@/lib/install";

/**
 * The first time the person opens the installed app: notes it, then refreshes the page so the
 * setup checklist ticks it off and install prompts go away.
 */
export async function markInstalled(): Promise<void> {
  const me = await requireMember();
  if (me.member.installedAt) return;
  await noteInstalled(getDb(), me.member.id);
  refresh();
}

/** Home's prompt to install the app was closed or followed, so it doesn't show again. */
export async function finishInstallPrompt(): Promise<void> {
  const me = await requireMember();
  await noteInstallPromptDone(getDb(), me.member.id);
}

/** Email me the link, on Install the app: sends the guide's address to the person's own email. */
export async function emailInstallLink(): Promise<{ sentTo: string } | { error: string }> {
  const me = await requireMember();
  if (!(await takeAppLinkTurn(getDb(), me.member.id)))
    return { error: "It's on its way. Check your email, or try again in a minute." };
  const h = await headers();
  const { origin } = relyingParty(h.get("x-forwarded-host") ?? h.get("host"));
  const sent = await sendAppLinkEmail(me.user.email, {
    name: me.user.name,
    url: new URL("/install", origin).toString(),
  });
  return sent ? { sentTo: me.user.email } : { error: "That didn't send. Try again in a minute." };
}
