import { isCronCall } from "@/lib/auth";
import { syncEverything } from "@/lib/banks/live";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
/** The same room as signed-in pages. The sync stops starting new work well before it runs out. */
export const maxDuration = 60;

/**
 * The daily sync, called by Vercel Cron once a day (`vercel.json`). It works through every
 * household's live sync connections, stalest first, until they're done or its time is up; any left
 * over sync next time someone opens the app. Answers with counts only.
 */
export async function GET(request: Request) {
  if (!isCronCall(request.headers.get("authorization")))
    return Response.json({ error: "Not allowed" }, { status: 401 });
  // On your own computer a pretend SimpleFIN server can run on localhost; never on Vercel.
  const allowLocal = process.env.NODE_ENV === "development";
  const counts = await syncEverything(getDb(), { allowLocal });
  console.info("Daily sync", counts);
  return Response.json(counts);
}
