import { browserStore, waitingChanged } from "./queue";

/** Serwist's precache: the app's own code, styles, fonts and icons, the same for everyone. */
const isAppCode = (name: string) => name.startsWith("serwist-precache");

/**
 * Forgets everything this device kept for the person: every cache but the app's own code (the
 * kept pages are the only one with their money in it) and any changes still waiting to be sent.
 * Runs on sign out and on the sign-in page, which is also where an ended session lands.
 */
export async function forgetThisDevice(): Promise<void> {
  const caching = typeof caches === "undefined" ? [] : await caches.keys().catch(() => []);
  await Promise.allSettled([
    ...caching.filter((name) => !isAppCode(name)).map((name) => caches.delete(name)),
    typeof indexedDB === "undefined" ? null : browserStore.clear().then(waitingChanged),
  ]);
}
