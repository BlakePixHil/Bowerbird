import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./Table.module.css";

/** A data table that scrolls sideways on a narrow screen. The caption names it for screen readers. */
export function Table({
  caption,
  showCaption = false,
  children,
  className,
}: {
  caption: string;
  showCaption?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx(styles.scroll, className)}>
      <table className={styles.table}>
        <caption className={showCaption ? undefined : "sr-only"}>{caption}</caption>
        {children}
      </table>
    </div>
  );
}

/** A column heading. `num` lines it up on the right for amounts. */
export function Th({
  num,
  className,
  scope = "col",
  ...rest
}: { num?: boolean } & ComponentProps<"th">) {
  return <th scope={scope} className={cx(styles.th, num && styles.num, className)} {...rest} />;
}

/** A cell. `num` right-aligns it with tabular figures for amounts. */
export function Td({ num, className, ...rest }: { num?: boolean } & ComponentProps<"td">) {
  return <td className={cx(styles.td, num && styles.num, className)} {...rest} />;
}
