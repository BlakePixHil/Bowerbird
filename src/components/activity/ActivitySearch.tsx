"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState, useTransition } from "react";
import { cx, Icon, Kbd } from "@/components/ui";
import styles from "./Activity.module.css";
import { activityHref, MAX_SEARCH, parseSearch, type Show } from "./show";

/**
 * Search a shop, amount or tag. The list follows as you type (after a short pause), and the words
 * live in the address as `?q=`, so the sidebar's search box and the back button work too.
 */
export function ActivitySearch({
  show,
  search,
  place,
}: {
  show: Show;
  search: string;
  /** The phone's box sits under the title; the desktop one is in the header with a / hint. */
  place: "phone" | "desktop";
}) {
  const router = useRouter();
  const [text, setText] = useState(search);
  // The search last asked for. A different one arriving means it came from somewhere else, such
  // as the sidebar, so the box shows it.
  const [sent, setSent] = useState(search);
  const [, startTransition] = useTransition();
  if (search !== sent) {
    setSent(search);
    setText(search);
  }

  function go(words: string) {
    setSent(words);
    startTransition(() => router.replace(activityHref(show, words), { scroll: false }));
  }

  const onPause = useEffectEvent(go);
  useEffect(() => {
    const words = parseSearch(text);
    if (words === sent) return;
    const timer = setTimeout(() => onPause(words), 300);
    return () => clearTimeout(timer);
  }, [text, sent]);

  return (
    <form
      role="search"
      className={cx(styles.search, place === "phone" ? styles.phoneSearch : styles.deskSearch)}
      onSubmit={(event) => {
        event.preventDefault();
        event.currentTarget.querySelector("input")?.blur();
        go(parseSearch(text));
      }}
    >
      <label className={styles.searchField}>
        <Icon name="search" size="sm" />
        <input
          type="search"
          name="q"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search a shop, amount or tag"
          aria-label="Search transactions"
          maxLength={MAX_SEARCH}
          enterKeyHint="search"
          autoComplete="off"
          data-search
          {...(place === "desktop" && { "aria-keyshortcuts": "/" })}
        />
        {place === "desktop" && (
          <span aria-hidden="true">
            <Kbd>/</Kbd>
          </span>
        )}
      </label>
    </form>
  );
}
