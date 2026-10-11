"use client";

import { cx } from "@/components/ui";
import { formatMoney, formatPercent } from "@/lib/money";
import styles from "./Bars.module.css";
import chart from "./Chart.module.css";
import { AxisSlots, ChartFrame, useChartPointer, type TableMode } from "./shared";

export type KeptMonth = {
  /** A stable id for the month, such as "2026-09". */
  key: string;
  /** The short label under the bar, such as "S" or "SEP". */
  label: string;
  /** The full name, such as "Sep 2026". */
  name: string;
  /** What was kept as a share of money in, or null with no money in. */
  share: number | null;
  /** Money in less money out, in cents. */
  kept: number;
};

type KeptBarsProps = {
  /** What the chart shows, such as "Share of pay kept, last 12 months". */
  label: string;
  months: readonly KeptMonth[];
  /** The share kept over the whole range, drawn as a line across. */
  average: number | null;
  /** The month picked, drawn solid with its share above it. */
  selected?: string | null;
  height?: number;
  /** Which side the average's label sits on. */
  averageSide?: "left" | "right";
  table?: TableMode;
};

/**
 * What's left over: the share of money in kept each month, in green, with the average as a line.
 * A month where more went out than came in drops below the line in red.
 */
export function KeptBars({
  label,
  months,
  average,
  selected = null,
  height = 96,
  averageSide = "right",
  table = "hidden",
}: KeptBarsProps) {
  const pointer = useChartPointer(months.length, "slots");
  const shares = months.map((m) => m.share ?? 0);
  const hi = Math.max(0.1, average ?? 0, ...shares) * 1.15;
  const lo = Math.min(0, ...shares) * 1.15;
  const y = (share: number) => ((hi - share) / (hi - lo)) * height;
  const zero = y(0);
  const selectedIndex = months.findIndex((m) => m.key === selected);
  const focus = months[selectedIndex] ?? months.at(-1);
  const active = pointer.active;
  const pct = (m: KeptMonth) => formatPercent(m.share);

  const summary = [
    `${label}.`,
    average !== null && `Average ${formatPercent(average)}.`,
    focus && `${focus.name}: ${pct(focus)} kept.`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ChartFrame
      summary={summary}
      table={{
        caption: label,
        columns: ["Month", "Kept", "Share"],
        rows: months.map((m) => [m.name, formatMoney(m.kept, { decimals: "never" }), pct(m)]),
      }}
      tableMode={table}
    >
      <div className={chart.plot} style={{ height }} {...pointer.bind}>
        {average !== null && (
          <span className={cx(styles.rule, styles.zero)} style={{ top: y(average) }} />
        )}
        <span className={cx(styles.rule, styles.zero)} style={{ top: zero }} />
        <div
          className={styles.columns}
          style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
        >
          {months.map((m, i) => {
            const share = m.share ?? 0;
            const on = i === selectedIndex || i === active;
            return (
              <span key={m.key} className={styles.column}>
                <span
                  className={cx(styles.bar, share >= 0 ? styles.up : styles.down)}
                  style={
                    share >= 0
                      ? {
                          top: y(share),
                          height: Math.max(0, zero - y(share) - 1),
                          background: "var(--left)",
                          opacity: on ? 1 : 0.45,
                        }
                      : {
                          top: zero + 1,
                          height: Math.max(0, y(share) - zero - 1),
                          background: "var(--out)",
                          opacity: on ? 1 : 0.45,
                        }
                  }
                />
              </span>
            );
          })}
        </div>
        {average !== null && (
          <span
            className={cx(chart.label, chart.onTop, averageSide === "right" && chart.right)}
            style={{ top: y(average) - 17, left: averageSide === "left" ? 0 : undefined }}
          >
            Average {formatPercent(average)}
          </span>
        )}
        {months.map((m, i) => {
          if (i !== selectedIndex && i !== active) return null;
          const share = m.share ?? 0;
          return (
            <span
              key={m.key}
              className={cx(
                chart.label,
                chart.onTop,
                chart.centred,
                i === selectedIndex && chart.strong,
              )}
              style={{
                left: `${((i + 0.5) / months.length) * 100}%`,
                top: share >= 0 ? y(share) - 17 : y(share) + 3,
              }}
            >
              {pct(m)}
            </span>
          );
        })}
      </div>
      <AxisSlots
        labels={months.map((m) => m.label)}
        on={selectedIndex >= 0 ? selectedIndex : null}
      />
    </ChartFrame>
  );
}
