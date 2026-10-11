import { accessFor } from "@/lib/auth/routes";

/*
 * What the service worker (src/app/sw.ts) keeps for reading offline, shared with the page so both
 * sides agree. Only signed-in pages are kept, never sign-in, setup, the first run or the forms that
 * connect a bank, and signing out empties the cache (forgetThisDevice).
 */

/** The cache of signed-in pages, as they last came from the server. */
export const PAGES_CACHE = "bowerbird-pages";

/** Shown when a page was never kept and there's no signal. Precached, the same for everyone. */
export const OFFLINE_PAGE = "/~offline";

/** Kept as soon as the app opens, so they open with no signal even if they weren't visited. */
export const KEPT_PAGES = ["/", "/activity", "/budgets"] as const;

/** A kept page older than this is fetched again when the app opens. */
export const KEEP_MINUTES = 30;

/** The most pages kept, and for how long. Activity's filters each make their own page. */
export const MAX_KEPT_PAGES = 40;
export const MAX_KEPT_DAYS = 30;

/** When the service worker kept a page, in milliseconds, on the copy it keeps. */
export const KEPT_AT_HEADER = "x-kept-at";

/** The message that asks the service worker to keep `KEPT_PAGES`. */
export const KEEP_PAGES = "KEEP_PAGES";

/** Asks the service worker to keep pages up to date, and whether the server answered. */
export type KeepPages = {
  type: typeof KEEP_PAGES;
  paths: string[];
  /** When the last sync finished. A page kept before then is fetched again. */
  since: number | null;
};

/** Signed-in pages never kept: the forms that connect a bank, and the first run's steps. */
const NEVER_KEPT = ["/connect", "/start"];

/** Whether a page may be kept: a signed-in page of this app, but none of `NEVER_KEPT`. */
export function keepsPage(url: URL, origin: string): boolean {
  if (url.origin !== origin || accessFor(url.pathname) !== "page") return false;
  return !NEVER_KEPT.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`));
}

/** Only a whole page that came straight back: no redirect to sign in, no error, nothing else. */
export function keepsResponse(response: Response): boolean {
  return (
    response.status === 200 &&
    !response.redirected &&
    response.type === "basic" &&
    (response.headers.get("content-type") ?? "").startsWith("text/html")
  );
}

/** When a kept copy was kept, or null for one without the header. */
export function keptAt(response: Response | undefined): number | null {
  return Number(response?.headers.get(KEPT_AT_HEADER)) || null;
}

/** A kept copy too old to show: its data could be a month out of date. */
export function tooOld(keptAt: number | null, now: number): boolean {
  return keptAt === null || now - keptAt > MAX_KEPT_DAYS * 86_400_000;
}

/** Whether a kept copy is new enough to leave alone, given when the last sync finished. */
export function keptRecently(keptAt: number | null, since: number | null, now: number): boolean {
  if (keptAt === null || now - keptAt > KEEP_MINUTES * 60_000) return false;
  return since === null || keptAt >= since;
}
