"use client";

import { Button, cx, SegmentedControl } from "@/components/ui";
import styles from "./Manage.module.css";
import { TABS } from "./look";
import { useManageParams } from "./params";

/**
 * Categories, Rules and Shop names. On desktop it sits in the page's header, with Add a category
 * beside it on Categories. On a phone it heads the page.
 */
export function CategoryTabs({ place }: { place: "desktop" | "phone" }) {
  const { tab, open, change } = useManageParams();
  return (
    <div className={cx(styles.tabs, place === "phone" ? styles.phoneTabs : styles.desktopTabs)}>
      <SegmentedControl
        label="What to show"
        options={TABS}
        value={tab}
        onChange={(value) => open(value)}
        name={`tab-${place}`}
      />
      {place === "desktop" && tab === "categories" && (
        <Button variant="primary" icon="plus" onClick={() => change({ add: "1", category: null })}>
          Add a category
        </Button>
      )}
    </div>
  );
}
