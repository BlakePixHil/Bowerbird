import type { ReactNode } from "react";
import styles from "@/components/setup/Setup.module.css";

// Like any signed-in page, these can carry on a first sync after it's sent, so each gets room for
// one run of it (see src/app/(app)/layout.tsx).
export const maxDuration = 60;

/** The first run: no menus, just the step, until setup is finished and Home takes over. */
export default function StartLayout({ children }: { children: ReactNode }) {
  return <main className={styles.page}>{children}</main>;
}
