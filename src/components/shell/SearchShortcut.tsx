"use client";

import { useEffect } from "react";
import { isSearchShortcut } from "./search";

/**
 * Pressing "/" puts the cursor in search. It picks the last search box on screen, so a page's own
 * search (such as Activity's) wins over the one in the sidebar.
 */
export function SearchShortcut() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const { key, metaKey, ctrlKey, altKey, defaultPrevented } = event;
      const target = event.target as HTMLElement | null;
      if (!isSearchShortcut({ key, metaKey, ctrlKey, altKey, defaultPrevented, target })) return;
      const boxes = [...document.querySelectorAll<HTMLInputElement>("input[data-search]")].filter(
        (box) => box.getClientRects().length > 0,
      );
      const box = boxes.at(-1);
      if (!box) return;
      event.preventDefault();
      box.focus();
      box.select();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}
