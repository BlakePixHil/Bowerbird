import { exportFiles, exportName } from "@/components/accounts/export-files";
import { exportData, viewerOf } from "@/lib/access";
import { apiMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { zipStream, type ZipTime } from "@/lib/export/zip";
import { todayIn } from "@/lib/money";

export const dynamic = "force-dynamic";

/** Now, in the household's time zone, for the dates on the files in the zip. */
function localTime(timeZone: string, now: Date): ZipTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/**
 * Export everything: a zip of CSV files with everything the signed-in member may see, streamed
 * one file at a time. Accounts and sharing links here.
 */
export async function GET() {
  const me = await apiMember();
  if (me instanceof Response) return me;
  const now = new Date();
  const today = todayIn(me.household.timezone, now);
  const data = await exportData(getDb(), viewerOf(me));
  const zip = zipStream(exportFiles(data, today), localTime(me.household.timezone, now));
  return new Response(zip, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${exportName(today)}.zip"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
