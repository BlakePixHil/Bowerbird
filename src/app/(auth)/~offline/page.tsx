import type { Metadata } from "next";
import { KEPT_PAGES } from "@/components/offline/caching";
import { TryAgain } from "@/components/offline/TryAgain";
import { ButtonLink, LogoMark } from "@/components/ui";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Offline" };

const NAMES: Record<(typeof KEPT_PAGES)[number], string> = {
  "/": "Home",
  "/activity": "Activity",
  "/budgets": "Budgets",
};

/**
 * What the service worker shows for a page it never kept when there's no signal. It's built once
 * and precached, so it has nothing of anyone's in it. The pages it links to are always kept.
 */
export default function OfflinePage() {
  return (
    <section aria-labelledby="offline-title" className={styles.card}>
      <LogoMark size={56} />
      <div className={styles.words}>
        <h1 id="offline-title" className="h1">
          You&rsquo;re offline
        </h1>
        <p className="sub">
          This page isn&rsquo;t saved on this device yet. Home, Activity and Budgets are, with
          everything from the last sync.
        </p>
      </div>
      <nav aria-label="Saved pages" className={styles.pages}>
        {KEPT_PAGES.map((path) => (
          <ButtonLink key={path} href={path} size="lg" block>
            {NAMES[path]}
          </ButtonLink>
        ))}
      </nav>
      <TryAgain />
    </section>
  );
}
