"use client";

import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { tabOf, type Tab } from "./look";

/**
 * What the page shows lives in the address, so a reload or a shared link opens the same place:
 * `tab`, the picked category (`category`) or rule (`rule`), a rules filter (`for`), and `add`
 * while a new category is being added. Changes replace the address without asking the server.
 */
export function useManageParams() {
  const params = useSearchParams();
  const change = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes))
        if (value === null) next.delete(key);
        else next.set(key, value);
      const query = next.toString();
      window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    },
    [params],
  );
  return {
    tab: tabOf(params.get("tab")),
    category: params.get("category"),
    rule: params.get("rule"),
    ruleFor: params.get("for"),
    adding: params.get("add") === "1",
    change,
    /** Opens a tab, leaving what was picked on the others behind. */
    open: (tab: Tab, more: Record<string, string | null> = {}) =>
      change({ tab, category: null, rule: null, for: null, add: null, ...more }),
  };
}
