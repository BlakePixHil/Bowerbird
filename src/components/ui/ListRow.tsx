import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import styles from "./ListRow.module.css";

type ListRowProps = {
  /** Usually a Tile or an Avatar. */
  leading?: ReactNode;
  title: ReactNode;
  /** The grey second line, such as "Groceries · Everyday". */
  detail?: ReactNode;
  /** Usually an amount, a pill or a chevron. */
  trailing?: ReactNode;
  /** Makes the whole row open this page. The link's name is the title. */
  href?: string;
  as?: "div" | "li";
  className?: string;
};

/** A 56px row, the building block of every list. */
export function ListRow({
  leading,
  title,
  detail,
  trailing,
  href,
  as: Tag = "div",
  className,
}: ListRowProps) {
  return (
    <Tag className={cx(styles.row, className)}>
      {leading}
      <div className={styles.text}>
        {href ? (
          <Link href={href} className={cx(styles.title, styles.stretched)}>
            {title}
          </Link>
        ) : (
          <span className={styles.title}>{title}</span>
        )}
        {detail && <span className={styles.detail}>{detail}</span>}
      </div>
      {trailing && <div className={styles.trailing}>{trailing}</div>}
    </Tag>
  );
}

type TileProps = {
  icon?: IconName;
  /** Letters to show when there's no icon, such as a bank's initials. */
  children?: ReactNode;
  size?: "sm" | "md" | "lg";
  tone?: "default" | "accent" | "good";
  className?: string;
};

/** The rounded square at the start of a row. It's decoration, so screen readers skip it. */
export function Tile({ icon, children, size = "md", tone = "default", className }: TileProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        styles.tile,
        size !== "md" && styles[size],
        tone !== "default" && styles[tone],
        className,
      )}
    >
      {icon ? <Icon name={icon} size={size === "lg" ? "md" : "sm"} /> : children}
    </span>
  );
}
