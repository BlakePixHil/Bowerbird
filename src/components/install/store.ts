"use client";

import { useSyncExternalStore } from "react";
import { browserOf, deviceOf, type Browser, type Device } from "./platform";

/**
 * What the browser knows about installing the app: whether it's running installed right now, and
 * the install prompt Chrome and Edge offer. The prompt event comes once, early, so it's caught as
 * soon as this file loads (InstallWatcher loads it on every signed-in page) and kept for Install
 * now. Browser only.
 */

/** Chrome and Edge's install prompt. Not in TypeScript's DOM types, since it isn't a standard. */
type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallPrompt = {
  /** The browser offered to install the app, so Install now can open its prompt. */
  canPrompt: boolean;
  /** Installed from this page, so it says so until the page is closed. */
  justInstalled: boolean;
};

const NOTHING_YET: InstallPrompt = { canPrompt: false, justInstalled: false };

let waiting: InstallPromptEvent | null = null;
let state = NOTHING_YET;
const listeners = new Set<() => void>();

function set(next: InstallPrompt) {
  if (next.canPrompt === state.canPrompt && next.justInstalled === state.justInstalled) return;
  state = next;
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep the browser's own mini prompt away; Install the app has the button.
    event.preventDefault();
    waiting = event as InstallPromptEvent;
    set({ ...state, canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    waiting = null;
    set({ canPrompt: false, justInstalled: true });
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Install now: opens the browser's prompt. False when the person said no or it can't show. */
export async function promptInstall(): Promise<boolean> {
  const event = waiting;
  if (!event) return false;
  // The prompt works once, so the button goes until the browser offers it again.
  waiting = null;
  set({ ...state, canPrompt: false });
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
}

export function useInstallPrompt(): InstallPrompt {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => NOTHING_YET,
  );
}

const STANDALONE = "(display-mode: standalone)";

/** Opened from the Home Screen, or as an installed app in its own window. */
export function runningInstalled(): boolean {
  const iosHomeScreen = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosHomeScreen || window.matchMedia(STANDALONE).matches;
}

function subscribeStandalone(listener: () => void) {
  const media = window.matchMedia(STANDALONE);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

/** Whether the app is running installed. Never on the server, which can't tell. */
export function useRunningInstalled(): boolean {
  return useSyncExternalStore(subscribeStandalone, runningInstalled, () => false);
}

const still = () => () => {};

/** The device, from the browser once it's running, or the server's guess until then. */
export function useDevice(guess: Device): Device {
  return useSyncExternalStore(
    still,
    () => deviceOf(navigator.userAgent, navigator.maxTouchPoints),
    () => guess,
  );
}

/** The browser, from the browser once it's running, or the server's guess until then. */
export function useBrowser(guess: Browser): Browser {
  return useSyncExternalStore(
    still,
    () => browserOf(navigator.userAgent),
    () => guess,
  );
}
