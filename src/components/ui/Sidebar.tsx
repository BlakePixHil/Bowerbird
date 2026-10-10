"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, type ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { isCurrent } from "./nav";
import styles from "./Sidebar.module.css";

/** The desktop menu. On a phone it turns into a scrolling row above the page. */
export function Sidebar({
  label = "Main menu",
  children,
  footer,
  className,
}: {
  label?: string;
  children: ReactNode;
  /** Pinned to the bottom, such as Settings. Hidden on a phone. */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cx(styles.side, className)}>
      {children}
      {footer && <div className={styles.foot}>{footer}</div>}
    </nav>
  );
}

/** A titled group of menu items, such as Reports. The title is hidden on a phone. */
export function NavSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className={styles.group}>
      <div id={id} className={styles.heading}>
        {title}
      </div>
      {children}
    </div>
  );
}

type NavItemProps = {
  href: string;
  icon: IconName;
  children: ReactNode;
  /** A small number at the end, such as transactions waiting to be sorted. */
  count?: number;
  /** Leave it out of the phone's scrolling row. */
  hideOnPhone?: boolean;
  /** Override whether it's the page you're on, for previews. Otherwise it follows the address. */
  current?: boolean;
};

export function NavItem({ href, icon, children, count, hideOnPhone, current }: NavItemProps) {
  const pathname = usePathname();
  const on = current ?? isCurrent(href, pathname);
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={cx(styles.nav, "hit", hideOnPhone && styles.phoneHidden)}
    >
      <Icon name={icon} size="sm" />
      <span>{children}</span>
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </Link>
  );
}
