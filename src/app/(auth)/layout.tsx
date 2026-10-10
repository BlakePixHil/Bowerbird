import type { ReactNode } from "react";
import styles from "./auth.module.css";

/** Sign-in and setup: no menus, just the page, with a soft blue glow behind it. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div aria-hidden="true" className={styles.glow} />
      {children}
    </main>
  );
}
