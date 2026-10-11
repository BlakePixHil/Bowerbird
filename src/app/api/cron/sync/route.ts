import { isCronCall } from "@/lib/auth";
import { carryBalancesForward } from "@/lib/banks/balances";
import { syncEverything } from "@/lib/banks/live";
import { getDb } from "@/lib/db";
import { nameShops } from "@/lib/sorting/merchants";

export const dynamic = "force-dynamic";
/** The same room as signed-in pages. The sync stops starting new work well before it runs out. */
export const maxDuration = 60;

/**
 * The daily sync, called by Vercel Cron once a day (`vercel.json`). It works through every
 * household's live sync connections, stalest first, until they're done or its time is up; any left
 * over sync next time someone opens the app. Then it carries every other account's balance forward
 * to today, so each account has one for every day, and names the shops of any rows that came in
 * before shops were named. Answers with counts only.
 */
export async function GET(request: Request) {
  if (!isCronCall(request.headers.get("authorization")))
    return Response.json({ error: "Not allowed" }, { status: 401 });
  // On your own computer a pretend SimpleFIN server can run on localhost; never on Vercel.
  const allowLocal = process.env.NODE_ENV === "development";
  const db = getDb();
  const counts = await syncEverything(db, { allowLocal });
  const balances = await carryBalancesForward(db);
  const shops = await nameShops(db);
  console.info("Daily sync", counts, "balances carried forward", balances, "shops", shops);
  return Response.json({ ...counts, balances, shops });
}
