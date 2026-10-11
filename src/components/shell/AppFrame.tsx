import type { ReactNode } from "react";
import { InstallWatcher } from "@/components/install/InstallWatcher";
import { OfflineSupport } from "@/components/offline/OfflineSupport";
import { TabBar } from "@/components/ui";
import { AppSidebar } from "./AppSidebar";
import { getShell } from "./data";
import { TABS, visible } from "./nav";
import { SearchShortcut } from "./SearchShortcut";
import { SyncOnOpen } from "./SyncOnOpen";
import styles from "./Shell.module.css";

/**
 * The frame around every signed-in page: the sidebar on desktop, the floating tab bar on a phone
 * (760px and narrower), and the page in between. Pages start with a PageHeader, under the offline
 * banner when there's no signal.
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
        <div className={styles.wrap}>
          <OfflineSupport
            memberId={shell.member.id}
            lastSync={shell.lastSyncedAt?.toISOString() ?? null}
            savedAt={shell.now.toISOString()}
            timeZone={shell.timeZone}
          />
          {children}
        </div>
      </main>
      <TabBar items={visible(TABS)} className={styles.tabbar} />
      <SearchShortcut />
      {shell.syncDue && <SyncOnOpen />}
      <InstallWatcher installed={shell.installed} />
    </div>
  );
}
