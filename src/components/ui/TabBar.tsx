"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { isCurrent, type NavLink } from "./nav";
import styles from "./TabBar.module.css";

type TabBarProps = {
  items: readonly NavLink[];
  /** Pin it to the bottom of the screen. Off when showing it inside a frame. */
  floating?: boolean;
  /** Override which tab is on, for previews. Otherwise it follows the address. */
  current?: string;
  className?: string;
};

/** The phone's floating bottom tab bar: Home, Activity, Budgets, Goals, Reports. */
export function TabBar({ items, floating = true, current, className }: TabBarProps) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className={cx(floating && styles.floating, className)}>
      <ul className={styles.tabbar}>
        {items.map((item) => {
          const on = current ? current === item.href : isCurrent(item.href, pathname);
          return (
            <li key={item.href}>
              <Link href={item.href} className={styles.tab} aria-current={on ? "page" : undefined}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
