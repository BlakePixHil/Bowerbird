"use client";

import { useEffect, useRef, useTransition } from "react";
import { syncWhenDue } from "./actions";

/**
 * Starts the sync that's due once the page is showing, so opening the app never waits on the
 * bank. The header says Syncing… until it's done and the page refreshes. Draws nothing, and does
 * nothing on a page kept for reading offline when there's no signal.
 */
export function SyncOnOpen() {
  const started = useRef(false);
  const [, startTransition] = useTransition();
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!navigator.onLine) return;
    startTransition(() => syncWhenDue().catch(() => {}));
  }, []);
  return null;
}
