import type { CSSProperties, ReactNode } from "react";
import styles from "./ChartTooltip.module.css";
import { cx } from "./cx";
import { colourVar, type DataColour } from "./Meter";

export type TooltipRow = {
  label: string;
  value: ReactNode;
  colour?: DataColour;
  /** Draw the key as a short line, for line series, instead of a square. */
  line?: boolean;
};

type ChartTooltipProps = {
  title: ReactNode;
  rows: readonly TooltipRow[];
  /** Where it sits inside the chart, set by the chart as the pointer moves. */
  style?: CSSProperties;
  className?: string;
};

/**
 * The box that follows the pointer over a chart. The same numbers are always in a list or table
 * next to the chart, so screen readers skip this copy.
 */
export function ChartTooltip({ title, rows, style, className }: ChartTooltipProps) {
  return (
    <div aria-hidden="true" className={cx(styles.tip, className)} style={style}>
      <div className={styles.title}>{title}</div>
      {rows.map((row) => (
        <div key={row.label} className={styles.row}>
          {row.colour && (
            <span
              className={cx(styles.key, row.line && styles.line)}
              style={{ background: colourVar(row.colour) }}
            />
          )}
          <span>{row.label}</span>
          <span className={styles.value}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
