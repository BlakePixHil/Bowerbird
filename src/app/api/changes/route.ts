import { viewerOf } from "@/lib/access";
import { apiMember } from "@/lib/auth";
import { applyChange, isChangeKind } from "@/lib/changes";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Far more than any one change needs. A split of 20 parts is under 2 KB. */
const MAX_BODY = 32_000;

const refuse = (status: number, error: string) => Response.json({ error }, { status });

/** Only the app's own pages may send changes: browsers say where a request came from. */
function fromThisApp(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  return !!origin && URL.canParse(origin) && new URL(origin).host === request.headers.get("host");
}

/**
 * The offline queue's way in: one change made while the phone had no signal, sent once it's back
 * online, in the order they were made. The body is `{ memberId, kind, change }`. Each change is
 * saved once by its id, so a copy sent again answers `already` and changes nothing. A change from
 * someone else's queue on this device is refused, so it can be dropped.
 *
 * Server actions can't do this job: their ids change with every deploy, and a change can wait in
 * the queue across several.
 */
export async function POST(request: Request) {
  if (!fromThisApp(request)) return refuse(403, "Not allowed");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return refuse(415, "Send JSON");
  const text = await request.text();
  if (text.length > MAX_BODY) return refuse(413, "Too big");

  const me = await apiMember();
  if (me instanceof Response) return me;

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return refuse(400, "That change didn't make sense.");
  }
  if (typeof body !== "object" || body === null)
    return refuse(400, "That change didn't make sense.");
  const { memberId, kind, change } = body as Record<string, unknown>;
  if (memberId !== me.member.id) return refuse(409, "That change was made by someone else.");
  if (!isChangeKind(kind)) return refuse(400, "That change didn't make sense.");

  const result = await applyChange(getDb(), viewerOf(me), kind, change as never);
  return Response.json(result);
}
