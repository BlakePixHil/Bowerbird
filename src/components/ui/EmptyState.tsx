import type { ReactNode } from "react";
import { Card } from "./Card";
import styles from "./EmptyState.module.css";
import type { IconName } from "./icons";
import { Tile } from "./ListRow";

type EmptyStateProps = {
  icon: IconName;
  /** What isn't here yet, in plain words: "No transactions yet". */
  title: string;
  /** What will show up here, and how it gets here. */
  children?: ReactNode;
  /** The one thing to do next, such as a button to import a file. */
  action?: ReactNode;
  /** Heading level for the title, so it fits the page's outline. */
  level?: 2 | 3;
  className?: string;
};

/** A calm card for a page or section with nothing to show yet. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  level = 2,
  className,
}: EmptyStateProps) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <Card as="section" className={className}>
      <div className={styles.empty}>
        <Tile icon={icon} />
        <Heading className={styles.title}>{title}</Heading>
        {children && <p className={styles.text}>{children}</p>}
        {action && <div className={styles.action}>{action}</div>}
      </div>
    </Card>
  );
}
