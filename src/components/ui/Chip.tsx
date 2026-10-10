import type { ComponentProps, ReactNode } from "react";
import styles from "./Chip.module.css";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

/** A round filter button that stays pressed while its filter is on. */
export function Chip({
  on = false,
  icon,
  className,
  children,
  type = "button",
  ...rest
}: { on?: boolean; icon?: IconName } & Omit<ComponentProps<"button">, "aria-pressed">) {
  return (
    <button type={type} aria-pressed={on} className={cx(styles.chip, "hit", className)} {...rest}>
      {icon && <Icon name={icon} size="sm" />}
      {children}
    </button>
  );
}

/** A small grey label on a row, such as Pending or Not counted. */
export function Tag({ icon, children }: { icon?: IconName; children: ReactNode }) {
  return (
    <span className={styles.tag}>
      {icon && <Icon name={icon} size="sm" />}
      {children}
    </span>
  );
}

export type PillTone = "good" | "warn" | "crit" | "accent" | "quiet";

const TONE_ICON: Record<PillTone, IconName | null> = {
  good: "check",
  warn: "alert",
  crit: "alert",
  accent: null,
  quiet: null,
};

/**
 * A status label. Good, warn and crit always show an icon with the words, because status is never
 * shown by colour alone. Pass icon={null} only when the words make the status obvious.
 */
export function Pill({
  tone,
  icon,
  children,
  className,
}: {
  tone: PillTone;
  icon?: IconName | null;
  children: ReactNode;
  className?: string;
}) {
  const shown = icon === undefined ? TONE_ICON[tone] : icon;
  return (
    <span className={cx(styles.pill, styles[tone], !shown && styles.plain, className)}>
      {shown && <Icon name={shown} size="sm" />}
      <span>{children}</span>
    </span>
  );
}

/** A keyboard key, such as the / that opens search. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}
