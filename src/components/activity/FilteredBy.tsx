import Link from "next/link";
import { colourVar, Icon, type DataColour } from "@/components/ui";
import styles from "./Activity.module.css";

export type FilteredChip = { key: string; label: string; colour?: DataColour; href: string };

/** "Filtered by" over the list: each filter in use, which a tap takes away, then Clear all. */
export function FilteredBy({ chips, clearHref }: { chips: FilteredChip[]; clearHref: string }) {
  if (chips.length === 0) return null;
  return (
    <div role="group" aria-label="Filters in use" className={styles.filteredBy}>
      <span className="small muted">Filtered by</span>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          replace
          scroll={false}
          className={styles.filteredChip}
          aria-label={`Remove filter: ${chip.label}`}
        >
          {chip.colour && (
            <span className={styles.key} style={{ background: colourVar(chip.colour) }} />
          )}
          <span>{chip.label}</span>
          <Icon name="close" size="sm" />
        </Link>
      ))}
      <Link href={clearHref} replace scroll={false} className={styles.clearAll}>
        Clear all
      </Link>
    </div>
  );
}
