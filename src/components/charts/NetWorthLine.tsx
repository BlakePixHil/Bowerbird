"use client";

import { ChartTooltip, cx } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import chart from "./Chart.module.css";
import { dollars, shortMoney } from "./format";
import { areaPath, linePath, n1, type XY } from "./paths";
import { linear, niceScale, tooltipShift } from "./scale";
import { AxisSlots, ChartFrame, useChartPointer, type TableMode } from "./shared";

export type MonthPoint = {
  /** The short label under the point, such as "NOV" or "TODAY". */
  label: string;
  /** The full name, such as "End of Nov 2025". */
  name: string;
  cents: number;
};

type NetWorthLineProps = {
  /** What the chart shows, such as "Net worth, last 12 months". */
  label: string;
  points: readonly MonthPoint[];
  height?: number;
  /** A small chart for a tile: just the line, its wash and the end dot. */
  compact?: boolean;
  /** About how many value labels to show up the side. */
  yTicks?: number;
  /** The words by the last point, such as "Today $270,945". */
  endLabel?: string;
  table?: TableMode;
};

const W = 1000;

/** What you own minus what you owe over time, as a green line over a soft wash. */
export function NetWorthLine({
  label,
  points,
  height = 140,
  compact = false,
  yTicks = 2,
  endLabel,
  table = "hidden",
}: NetWorthLineProps) {
  const pointer = useChartPointer(points.length, "slots");
  const values = points.map((p) => p.cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const scale = compact
    ? { lo: min, hi: max === min ? min + 1 : max, ticks: [] as number[] }
    : niceScale(min, max + (max - min) * 0.08, yTicks);
  const pad = compact ? 4 : 10;
  const y = linear([scale.lo, scale.hi], [height - pad, pad]);
  // Each point sits in the middle of its month, so the labels underneath line up.
  const xAt = (i: number) =>
    compact ? (i / Math.max(points.length - 1, 1)) * W : ((i + 0.5) / points.length) * W;
  const xy: XY[] = points.map((p, i) => [xAt(i), y(p.cents)]);
  const last = points.at(-1);
  const first = points[0];
  const active = pointer.active;
  const activePct = active === null ? 0 : (xAt(active) / W) * 100;

  const change = (i: number) =>
    i > 0
      ? formatMoney(points[i].cents - points[i - 1].cents, { decimals: "never", sign: "always" })
      : "";

  const summary =
    last && first
      ? `${label}. ${last.name}: ${dollars(last.cents)}. ${formatMoney(last.cents - first.cents, { decimals: "never", sign: "always" })} since ${first.name.charAt(0).toLowerCase()}${first.name.slice(1)}.`
      : label;

  return (
    <ChartFrame
      summary={summary}
      table={{
        caption: label,
        columns: ["Month", "Net worth", "Change"],
        rows: points.map((p, i) => [p.name, dollars(p.cents), change(i)]),
      }}
      tableMode={table}
    >
      <div className={chart.plot} style={{ height }} {...(compact ? {} : pointer.bind)}>
        <svg
          className={chart.svg}
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {scale.ticks.slice(1).map((t) => (
            <line key={t} className={chart.grid} x1={0} x2={W} y1={n1(y(t))} y2={n1(y(t))} />
          ))}
          {!compact && (
            <line className={chart.axis} x1={0} x2={W} y1={height - 0.5} y2={height - 0.5} />
          )}
          <path style={{ fill: "var(--pos-wash)" }} d={areaPath(xy, height)} />
          <path className={chart.line} style={{ stroke: "var(--pos)" }} d={linePath(xy)} />
        </svg>
        {scale.ticks.slice(1).map((t) => (
          <span
            key={t}
            className={chart.label}
            style={{ left: 0, top: y(t) - 18, color: "var(--text-3)" }}
          >
            {shortMoney(t)}
          </span>
        ))}
        {last && (
          <span
            className={cx(chart.dot, compact && chart.dotSm)}
            style={{
              left: `${(xAt(points.length - 1) / W) * 100}%`,
              top: y(last.cents),
              background: "var(--pos)",
            }}
          />
        )}
        {endLabel && last && (
          <span
            className={cx(chart.label, chart.strong)}
            style={{
              left: `${(xAt(points.length - 1) / W) * 100}%`,
              top: y(last.cents) - 30,
              transform: "translateX(-80%)",
            }}
          >
            {endLabel}
          </span>
        )}
        {active !== null && points[active] && (
          <>
            <span className={chart.crosshair} style={{ left: `${activePct}%` }} />
            <span
              className={chart.dot}
              style={{
                left: `${activePct}%`,
                top: y(points[active].cents),
                background: "var(--text)",
              }}
            />
            <ChartTooltip
              className={chart.tip}
              title={points[active].name}
              rows={[
                {
                  label: "Net worth",
                  value: dollars(points[active].cents),
                  colour: "pos",
                  line: true,
                },
                ...(active > 0 ? [{ label: "Since the month before", value: change(active) }] : []),
              ]}
              style={{ left: `${activePct}%`, transform: tooltipShift(activePct) }}
            />
          </>
        )}
      </div>
      {!compact && <AxisSlots labels={points.map((p) => p.label)} on={points.length - 1} />}
    </ChartFrame>
  );
}
