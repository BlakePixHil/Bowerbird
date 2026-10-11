"use client";

import { useEffect } from "react";
import { markInstalled } from "./actions";
import { useRunningInstalled } from "./store";

/**
 * On every signed-in page: loads the install store early enough to catch the browser's install
 * prompt, and notes the first time the person opens the installed app.
 */
export function InstallWatcher({ installed }: { installed: boolean }) {
  const running = useRunningInstalled();
  useEffect(() => {
    if (running && !installed) void markInstalled().catch(() => {});
  }, [running, installed]);
  return null;
}
