/// <reference lib="webworker" />
import {
  NetworkFirst,
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
  type SerwistPlugin,
} from "serwist";
import {
  KEEP_PAGES,
  keepsPage,
  keepsResponse,
  keptAt,
  KEPT_AT_HEADER,
  keptRecently,
  MAX_KEPT_PAGES,
  OFFLINE_PAGE,
  PAGES_CACHE,
  tooOld,
  type KeepPages,
} from "@/components/offline/caching";

/*
 * The service worker, built by Serwist into /serwist/sw.js (src/app/serwist/[path]/route.ts).
 *
 * - The app's own code, styles, fonts and icons are precached when it installs, so any kept page
 *   can draw with no signal.
 * - Signed-in pages are fetched from the server first. Each good one is kept, and offline (or
 *   after 8 seconds of waiting) the kept copy shows instead. Sign-in, setup and the bank forms
 *   are never kept (`keepsPage`), nor is anything but a whole page (`keepsResponse`).
 * - A page that was never kept shows the offline page.
 * - Nothing else goes through here: the data inside a page comes with the page, and changes made
 *   offline wait in the page's own queue (src/components/offline) until there's signal.
 */

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

/** A copy of the page that says when it was kept. */
function stamped(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set(KEPT_AT_HEADER, String(Date.now()));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Keeps the newest MAX_KEPT_PAGES pages and lets the rest go. */
async function trim(): Promise<void> {
  const cache = await caches.open(PAGES_CACHE);
  const requests = await cache.keys();
  if (requests.length <= MAX_KEPT_PAGES) return;
  const kept = await Promise.all(
    requests.map(async (request) => ({ request, at: keptAt(await cache.match(request)) ?? 0 })),
  );
  kept.sort((a, b) => a.at - b.at);
  const extra = kept.slice(0, kept.length - MAX_KEPT_PAGES);
  await Promise.all(extra.map(({ request }) => cache.delete(request)));
}

/*
 * Only whole pages are kept, each stamped with when, never more than MAX_KEPT_PAGES, and none is
 * shown once it's MAX_KEPT_DAYS old. Nothing about them is kept anywhere else, so emptying the
 * cache on sign out forgets them completely.
 */
const keptPages: SerwistPlugin = {
  cacheWillUpdate: async ({ response }) => (keepsResponse(response) ? stamped(response) : null),
  cacheDidUpdate: () => trim(),
  cachedResponseWillBeUsed: async ({ cachedResponse }) =>
    cachedResponse && !tooOld(keptAt(cachedResponse), Date.now()) ? cachedResponse : null,
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    {
      matcher: ({ request, url }) =>
        request.mode === "navigate" && keepsPage(url, self.location.origin),
      handler: new NetworkFirst({
        cacheName: PAGES_CACHE,
        networkTimeoutSeconds: 8,
        // Next varies pages on its router headers, which a page load never sends.
        matchOptions: { ignoreVary: true },
        plugins: [keptPages],
      }),
    },
    // Every other page goes to the network, so the offline page can show when there's none.
    { matcher: ({ request }) => request.mode === "navigate", handler: new NetworkOnly() },
  ],
  fallbacks: {
    entries: [{ url: OFFLINE_PAGE, matcher: ({ request }) => request.mode === "navigate" }],
  },
});

/** Kept pages from an earlier version, being cleared away (see "activate" below). */
let clearing: Promise<unknown> = Promise.resolve();

/** Fetches the pages that aren't kept or are out of date. True when the server answered. */
async function keepPages({ paths, since }: KeepPages): Promise<boolean> {
  await clearing;
  const cache = await caches.open(PAGES_CACHE);
  const now = Date.now();
  const answered = await Promise.all(
    paths.map(async (path) => {
      const url = new URL(path, self.location.origin);
      if (!keepsPage(url, self.location.origin)) return false;
      const kept = await cache.match(url, { ignoreVary: true });
      if (keptRecently(keptAt(kept), since, now)) return true;
      try {
        const response = await fetch(url, { credentials: "same-origin" });
        if (keepsResponse(response)) await cache.put(url, stamped(response));
        return true;
      } catch {
        return false;
      }
    }),
  );
  await trim();
  return answered.some(Boolean);
}

self.addEventListener("message", (event) => {
  const data = event.data as KeepPages | undefined;
  if (data?.type !== KEEP_PAGES || !Array.isArray(data.paths)) return;
  const port = event.ports[0];
  event.waitUntil(keepPages(data).then((answered) => port?.postMessage({ answered })));
});

// Kept pages point at the code they were built with, which a new version clears away, so they
// go too. The app keeps its main pages again as soon as the new version takes over.
self.addEventListener("activate", (event) => {
  clearing = caches.delete(PAGES_CACHE);
  event.waitUntil(clearing);
});

serwist.addEventListeners();
