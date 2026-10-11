"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui";
import { KEEP_PAGES, KEPT_PAGES, type KeepPages } from "./caching";
import { useOnline } from "./online";
import { browserStore, onWaitingChanges } from "./queue";
import { sendWaiting, setChangesOwner } from "./send";
import { offlineLine, waitingLine } from "./words";
import styles from "./Offline.module.css";

/** The service worker Serwist builds from src/app/sw.ts. */
const SERVICE_WORKER = "/serwist/sw.js";

/** Only built apps have a service worker: in `pnpm dev` it would keep pages that are changing. */
const WORKS_OFFLINE = process.env.NODE_ENV === "production";

/** A page rendered this long before it loaded came from the device, not the server. */
const KEPT_COPY_MS = 3 * 60_000;

/** How long to wait for the service worker to say whether the server answered. */
const KEEP_TIMEOUT_MS = 20_000;

/**
 * Asks the service worker to keep the main pages up to date for reading offline. True when the
 * server answered it, false with no signal, and null with no service worker.
 */
async function keepMainPages(since: number | null): Promise<boolean | null> {
  const ready = await navigator.serviceWorker.ready;
  const worker = navigator.serviceWorker.controller ?? ready.active;
  if (!worker) return null;
  const message: KeepPages = { type: KEEP_PAGES, paths: [...KEPT_PAGES], since };
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), KEEP_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<{ answered?: boolean }>) => {
      clearTimeout(timer);
      resolve(event.data?.answered === true);
    };
    worker.postMessage(message, [channel.port2]);
  });
}

/** When this document started loading. It never changes, so it's safe as a snapshot. */
const loadedAt = () => Math.round(performance.timeOrigin);
const never = () => () => {};

/**
 * On every signed-in page (BUD-40): puts the service worker in place, keeps Home, Activity and
 * Budgets ready for reading offline, sends changes made offline once there's signal, and shows
 * the quiet offline banner: "Offline · showing your last sync from 9:12am", with how many changes
 * wait. It also shows on a page that came from the device because the server didn't answer,
 * until it does.
 */
export function OfflineSupport({
  memberId,
  lastSync,
  savedAt,
  timeZone,
}: {
  memberId: string;
  /** When the last sync finished, as an ISO string, or null without live sync. */
  lastSync: string | null;
  /** When the server drew this page, as an ISO string. */
  savedAt: string;
  timeZone: string;
}) {
  const router = useRouter();
  const online = useOnline();
  const opened = useSyncExternalStore(never, loadedAt, () => 0);
  const keptCopy = opened > 0 && opened - Date.parse(savedAt) > KEPT_COPY_MS;
  const [answered, setAnswered] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const [refused, setRefused] = useState<string[]>([]);
  const refreshed = useRef(false);

  // The server answered: a kept copy of the page gets the latest from it, once.
  const reached = useEffectEvent(() => {
    setAnswered(true);
    if (keptCopy && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  });

  const send = useEffectEvent(async () => {
    if (!navigator.onLine) return;
    const sent = await sendWaiting();
    if (sent.answered) reached();
    if (sent.refused.length > 0) setRefused((shown) => [...shown, ...sent.refused]);
    if (sent.saved > 0 || sent.refused.length > 0) router.refresh();
  });

  const keep = useEffectEvent(async () => {
    if (!WORKS_OFFLINE || !navigator.onLine || !("serviceWorker" in navigator)) return;
    const since = lastSync ? Date.parse(lastSync) : null;
    if (await keepMainPages(since).catch(() => null)) reached();
  });

  useEffect(() => {
    setChangesOwner(memberId);
    const count = () =>
      void browserStore
        .all()
        .then((all) => setWaiting(all.filter((change) => change.memberId === memberId).length))
        .catch(() => {});
    count();
    const stop = onWaitingChanges(count);
    return () => {
      stop();
      setChangesOwner(null);
    };
  }, [memberId]);

  useEffect(() => {
    if (!WORKS_OFFLINE || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(SERVICE_WORKER, { scope: "/", updateViaCache: "none" })
      .catch(() => {});
    const takeOver = () => void keep();
    navigator.serviceWorker.addEventListener("controllerchange", takeOver);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", takeOver);
  }, []);

  // Keep the main pages whenever the last sync changes, and when the signal comes back. Both wait
  // until the page has drawn.
  useEffect(() => {
    const soon = setTimeout(() => void keep(), 0);
    return () => clearTimeout(soon);
  }, [lastSync]);

  useEffect(() => {
    const soon = setTimeout(() => void send(), 0);
    const back = () => {
      void send();
      void keep();
    };
    const shown = () => document.visibilityState === "visible" && void send();
    window.addEventListener("online", back);
    document.addEventListener("visibilitychange", shown);
    return () => {
      clearTimeout(soon);
      window.removeEventListener("online", back);
      document.removeEventListener("visibilitychange", shown);
    };
  }, []);

  const offline = !online || (keptCopy && !answered);
  return (
    <>
      <div className={styles.live} role="status">
        {offline && (
          <div className={styles.banner}>
            <Icon name="offline" size="sm" />
            <span>
              {offlineLine(
                { lastSync: lastSync ? new Date(lastSync) : null, savedAt: new Date(savedAt) },
                new Date(),
                timeZone,
              )}
              {waiting > 0 && <span className={styles.waiting}> · {waitingLine(waiting)}</span>}
            </span>
          </div>
        )}
      </div>
      {refused.length > 0 && (
        <div className={styles.refused} role="alert">
          <span>
            {refused[0]}
            {refused.length > 1 && ` And ${refused.length - 1} more.`}
          </span>
          <button type="button" className={styles.dismiss} onClick={() => setRefused([])}>
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
