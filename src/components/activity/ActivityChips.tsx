"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Avatar, Chip, type IconName, type Owner } from "@/components/ui";
import styles from "./Activity.module.css";
import { activityHref, type Show } from "./show";

export type ChipChoice = {
  show: Show;
  label: string;
  count: number;
  icon?: IconName;
  avatar?: { owner: Owner; initials: string; label: string };
};

/** The quick chips over the list: All, whose it is when that's more than one, and To check. */
export function ActivityChips({
  choices,
  show,
  search,
}: {
  choices: ChipChoice[];
  show: Show;
  search: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <div role="group" aria-label="Show transactions" className={styles.chips}>
      {choices.map((choice) => (
        <Chip
          key={choice.show}
          on={choice.show === show}
          icon={choice.icon}
          className={choice.avatar && styles.avatarChip}
          onClick={() =>
            startTransition(() =>
              router.replace(activityHref(choice.show, search), { scroll: false }),
            )
          }
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
    </div>
  );
}
