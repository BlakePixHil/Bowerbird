"use client";

import { useSyncExternalStore } from "react";

/** Desktop: a list and the panel beside it. Below this, phones open a sheet instead. */
export const WIDE = "(min-width: 761px)";

/** True on desktop widths. False on the server and on a phone. */
export function useWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}
