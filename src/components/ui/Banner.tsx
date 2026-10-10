import type { ReactNode } from "react";
import styles from "./Banner.module.css";
import { cx } from "./cx";
import { Icon } from "./Icon";

type WarningBannerProps = {
  /** The short bold part, such as "Reconnect your bank." */
  title: string;
  /** The reason, such as "Consent expired." */
  children?: ReactNode;
  /** A button or link to fix it. */
  action?: ReactNode;
  className?: string;
};

/** Something needs attention. Amber, always with the warning icon and words. */
export function WarningBanner({ title, children, action, className }: WarningBannerProps) {
  return (
    <div className={cx(styles.banner, className)}>
      <Icon name="alert" className={styles.icon} />
      <div className={styles.text}>
        <span className={styles.title}>{title}</span>{" "}
        {children && <span className={styles.body}>{children}</span>}
      </div>
      {action}
    </div>
  );
}
