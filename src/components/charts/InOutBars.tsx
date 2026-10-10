"use client";

import { ChartTooltip, cx, type TooltipRow } from "@/components/ui";
import { formatMoney, formatPercent, ratio } from "@/lib/money";
import styles from "./Bars.module.css";
import chart from "./Chart.module.css";
import { dollars, shortMoney } from "./format";
import { niceScale, tooltipShift } from "./scale";
import { AxisSlots, ChartFrame, Legend, useChartPointer, type TableMode } from "./shared";

export type InOutMonth = {
  /** A stable id for the month, such as "2026-09". */
  key: string;
  /** The short label under the bar, such as "S" or "SEP". */
  label: string;
  /** The full name, such as "Sep 2026". */
  name: string;
  inCents: number;
  /** Money out as a positive number of cents. */
  outCents: number;
  /** The month isn't over yet, so its bars are drawn lighter. */
  partial?: boolean;
};

type InOutBarsProps = {
  /** What the chart shows, such as "Money in and out, last 12 months". */
  label: string;
  months: readonly InOutMonth[];
  /** The month picked, drawn solid with the others faded. */
  selected?: string | null;
  /** Makes each month a button. Called with the month's key. */
  onSelect?: (key: string) => void;
  height?: number;
  /** The "$15k in" and "$15k out" labels. Off by default on a chart too short to fit them. */
  scaleLabels?: boolean;
  legend?: boolean;
  table?: TableMode;
};

/** What was left over, such as "$3,130 · 28%". */
function kept(m: InOutMonth) {
  const left = m.inCents - m.outCents;
  return `${formatMoney(left, { decimals: "never" })} · ${formatPercent(ratio(left, m.inCents))}`;
}

/** The same in words for screen readers, such as "$3,130 kept (28%)". */
function keptWords(m: InOutMonth) {
  const left = m.inCents - m.outCents;
  return `${formatMoney(left, { decimals: "never" })} kept (${formatPercent(ratio(left, m.inCents))})`;
}

/** Money in rises from the zero line in green and money out drops below it in red, month by month. */
export function InOutBars({
  label,
  months,
  selected = null,
  onSelect,
  height = 188,
  scaleLabels = height >= 120,
  legend = true,
  table = "hidden",
}: InOutBarsProps) {
  const pointer = useChartPointer(months.length, "slots");
  const top = niceScale(0, Math.max(1, ...months.flatMap((m) => [m.inCents, m.outCents])), 3).hi;
  const zero = Math.round(height * 0.53);
  const up = (zero - 4) / top;
  const down = (height - zero - 4) / top;
  const selectedIndex = months.findIndex((m) => m.key === selected);
  const hasSelection = selectedIndex >= 0;
  const focus = hasSelection
    ? months[selectedIndex]
    : (months.findLast((m) => !m.partial) ?? months.at(-1));

  const opacity = (m: InOutMonth, i: number) => {
    const on = i === selectedIndex;
    if (m.partial) return on ? 0.7 : 0.4;
    return on || !hasSelection ? 1 : 0.45;
  };

  const tipRows = (m: InOutMonth): TooltipRow[] => [
    { label: "In", value: dollars(m.inCents), colour: "pos" },
    { label: "Out", value: dollars(m.outCents), colour: "neg" },
    { label: "Kept", value: kept(m) },
  ];

  const summary = focus
    ? `${label}. ${focus.name}: ${dollars(focus.inCents)} in, ${dollars(focus.outCents)} out, ${keptWords(focus)}.`
    : label;

  const active = pointer.active;
  const activePct = active === null ? 0 : ((active + 0.5) / months.length) * 100;

  return (
    <ChartFrame
      summary={summary}
      table={{
        caption: label,
        columns: ["Month", "In", "Out", "Kept"],
        rows: months.map((m) => [m.name, dollars(m.inCents), dollars(m.outCents), kept(m)]),
      }}
      tableMode={table}
      interactive={Boolean(onSelect)}
      after={
        legend && (
          <Legend
            className={chart.legendGap}
            items={[
              { label: "Money in", colour: "pos", kind: "square" },
              { label: "Money out", colour: "neg", kind: "square" },
            ]}
          />
        )
      }
    >
      <div className={chart.plot} style={{ height }} {...pointer.bind}>
        <span className={styles.rule} style={{ top: zero - top * up }} />
        <span className={styles.rule} style={{ top: zero + top * down }} />
        <span className={cx(styles.rule, styles.zero)} style={{ top: zero }} />
        {scaleLabels && (
          <>
            <span className={chart.label} style={{ left: 0, top: zero - top * up + 4 }}>
              {shortMoney(top)} in
            </span>
            <span className={chart.label} style={{ left: 0, top: zero + top * down - 18 }}>
              {shortMoney(top)} out
            </span>
          </>
        )}
        <div
          className={styles.columns}
          style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
        >
          {months.map((m, i) => {
            const bars = (
              <>
                <span
                  className={cx(styles.bar, styles.up)}
                  style={{
                    bottom: height - zero + 1,
                    height: m.inCents * up,
                    background: "var(--in)",
                    opacity: opacity(m, i),
                  }}
                />
                <span
                  className={cx(styles.bar, styles.down)}
                  style={{
                    top: zero + 1,
                    height: m.outCents * down,
                    background: "var(--out)",
                    opacity: opacity(m, i),
                  }}
                />
              </>
            );
            const className = cx(styles.column, i === selectedIndex && styles.selected);
            return onSelect ? (
              <button
                key={m.key}
                type="button"
                className={className}
                aria-pressed={i === selectedIndex}
                aria-label={`${m.name}: ${dollars(m.inCents)} in, ${dollars(m.outCents)} out`}
                onClick={() => onSelect(m.key)}
                onFocus={() => pointer.setActive(i)}
                onBlur={() => pointer.setActive(null)}
              >
                {bars}
              </button>
            ) : (
              <span key={m.key} className={className}>
                {bars}
              </span>
            );
          })}
        </div>
        {active !== null && months[active] && (
          <ChartTooltip
            className={chart.tip}
            title={months[active].name}
            rows={tipRows(months[active])}
            style={{ left: `${activePct}%`, top: -8, transform: tooltipShift(activePct) }}
          />
        )}
      </div>
      <AxisSlots
        labels={months.map((m) => m.label)}
        on={hasSelection ? selectedIndex : months.length - 1}
      />
    </ChartFrame>
  );
}
