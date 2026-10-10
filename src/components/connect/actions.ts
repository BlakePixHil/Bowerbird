"use server";

import { viewerOf } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { connectSimpleFin } from "@/lib/banks/connections";
import { getDb } from "@/lib/db";

export type ConnectAnswer = { ok: true; next: string } | { ok: false; error: string };

/**
 * Claims the pasted setup token for the signed-in member and saves the connection. The token is
 * only ever in this request: it isn't logged, saved or sent back.
 */
export async function connectLiveSync(form: FormData): Promise<ConnectAnswer> {
  const me = await requireMember();
  const token = form.get("token");
  if (typeof token !== "string" || token.length > 4096)
    return { ok: false, error: "Paste the setup token from Redbark." };
  // On your own computer a pretend SimpleFIN server can run on localhost; never on Vercel.
  const allowLocal = process.env.NODE_ENV === "development";
  const result = await connectSimpleFin(getDb(), viewerOf(me), token, { allowLocal });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, next: `/connect/accounts?connection=${result.connectionId}` };
}
