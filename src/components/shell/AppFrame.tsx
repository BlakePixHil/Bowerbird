import type { ReactNode } from "react";
import { TabBar } from "@/components/ui";
import { AppSidebar } from "./AppSidebar";
import { getShell } from "./data";
import { TABS, visible } from "./nav";
import { SearchShortcut } from "./SearchShortcut";
import styles from "./Shell.module.css";

/**
 * The frame around every signed-in page: the sidebar on desktop, the floating tab bar on a phone
 * (760px and narrower), and the page in between. Pages start with a PageHeader.
 */
export async function AppFrame({ children }: { children: ReactNode }) {
  const shell = await getShell();
  return (
    <div className={styles.app}>
      <a href="#main" className={styles.skip}>
        Skip to the page
      </a>
      <AppSidebar shell={shell} className={styles.sidebar} />
      <main id="main" className={styles.main}>
        <div className={styles.wrap}>{children}</div>
      </main>
      <TabBar items={visible(TABS)} className={styles.tabbar} />
      <SearchShortcut />
    </div>
  );
}
