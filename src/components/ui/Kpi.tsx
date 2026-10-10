import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "./Card";
import { cx } from "./cx";
import styles from "./Kpi.module.css";

/** A row of headline numbers that wraps into as many columns as fit. */
export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.grid, className)}>{children}</div>;
}

type KpiProps = {
  /** Such as "Left to spend". */
  label: string;
  /** The big number, usually a Money. */
  value: ReactNode;
  /** The line under it, such as "of $2,220 · about $72 a day". */
  detail?: ReactNode;
  /** A status pill at the top right. */
  badge?: ReactNode;
  /** Pinned to the bottom of the card, usually a BarMeter. */
  children?: ReactNode;
  /** Opens the page behind the number. */
  href?: string;
};

export function Kpi({ label, value, detail, badge, children, href }: KpiProps) {
  return (
    <Card className={styles.kpi}>
      <div className={styles.top}>
        {href ? (
          <Link href={href} className={cx(styles.label, styles.stretched)}>
            {label}
          </Link>
        ) : (
          <span className={styles.label}>{label}</span>
        )}
        {badge}
      </div>
      <span className={styles.value}>{value}</span>
      {detail && <span className={styles.detail}>{detail}</span>}
      {children && <div className={styles.foot}>{children}</div>}
    </Card>
  );
}
