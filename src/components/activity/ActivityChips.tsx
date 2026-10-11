"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Avatar, Chip, type IconName, type Owner } from "@/components/ui";
import type { Find } from "@/lib/access/find";
import styles from "./Activity.module.css";
import { activityHref, type Show } from "./show";

export type ChipChoice = {
  show: Show;
  label: string;
  count: number;
  icon?: IconName;
  avatar?: { owner: Owner; initials: string; label: string };
};

/** A saved view as a chip: where it goes, and whether it's what's showing. */
export type ViewChip = { id: string; name: string; count: number; href: string; on: boolean };

/**
 * The quick chips over the list: All, whose it is when that's more than one, To check, then the
 * person's saved views. The quick chips keep the filters in use; a view brings its own, and
 * tapping the one showing goes back to everything.
 */
export function ActivityChips({
  choices,
  views,
  show,
  search,
  find,
}: {
  choices: ChipChoice[];
  views: ViewChip[];
  show: Show;
  search: string;
  find: Find;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const go = (href: string) => startTransition(() => router.replace(href, { scroll: false }));
  const viewOn = views.some((view) => view.on);
  return (
    <div role="group" aria-label="Show transactions" className={styles.chips}>
      {choices.map((choice) => (
        <Chip
          key={choice.show}
          on={choice.show === show && !viewOn}
          icon={choice.icon}
          className={choice.avatar && styles.avatarChip}
          onClick={() => go(activityHref(choice.show, search, find))}
        >
          {choice.avatar && (
            <span aria-hidden="true" className={styles.chipAvatar}>
              <Avatar size="sm" {...choice.avatar} />
            </span>
          )}
          <span>{choice.label}</span>
          <span className={styles.chipCount}>{choice.count.toLocaleString("en-AU")}</span>
        </Chip>
      ))}
      {views.map((view) => (
        <Chip
          key={view.id}
          on={view.on}
          icon="bookmark"
          onClick={() => go(view.on ? activityHref("all", "") : view.href)}
        >
          <span>{view.name}</span>
          <span className={styles.chipCount}>{view.count.toLocaleString("en-AU")}</span>
        </Chip>
      ))}
    </div>
  );
}
