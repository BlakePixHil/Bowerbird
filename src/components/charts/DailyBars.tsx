"use client";

import { ChartTooltip, cx } from "@/components/ui";
import { dayOfWeek, formatShortDate, sumCents, type PlainDate } from "@/lib/money";
import styles from "./Bars.module.css";
import chart from "./Chart.module.css";
import { dollars } from "./format";
import type { DayPoint } from "./RunningTotalChart";
import { headroom, tooltipShift } from "./scale";
import { AxisSlots, ChartFrame, Legend, useChartPointer, type TableMode } from "./shared";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

type DailyBarsProps = {
  /** What the chart shows, such as "Everyday spending, last two weeks". */
  label: string;
  /** Spending on each day, oldest first, as positive cents. */
  days: readonly DayPoint[];
  /** Where the second group starts. Defaults to halfway, so two weeks sit side by side. */
  splitAt?: number;
  previousName?: string;
  currentName?: string;
  /** A usual day, drawn as a line across with its label on the right. */
  typical?: { cents: number; label: string };
  today?: PlainDate;
  height?: number;
  legend?: boolean;
  table?: TableMode;
};

/** Day by day spending: the earlier days in grey, the recent ones in red, with a typical-day line. */
export function DailyBars({
  label,
  days,
  splitAt = Math.floor(days.length / 2),
  previousName = "Last week",
  currentName = "This week",
  typical,
  today,
  height = 96,
  legend = true,
  table = "hidden",
}: DailyBarsProps) {
  const pointer = useChartPointer(days.length, "slots");
  const top = headroom([...days.map((d) => d.cents), typical?.cents ?? 0]);
  const scale = height / top;
  const before = sumCents(days.slice(0, splitAt).map((d) => d.cents));
  const after = sumCents(days.slice(splitAt).map((d) => d.cents));
  const todayIndex = today ? days.findIndex((d) => d.date === today) : -1;
  const active = pointer.active;
  const activePct = active === null ? 0 : ((active + 0.5) / days.length) * 100;

  const summary = [
    `${label}.`,
    `${currentName}: ${dollars(after)}.`,
    `${previousName}: ${dollars(before)}.`,
    typical && `${typical.label}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ChartFrame
      summary={summary}
      table={{
        caption: label,
        columns: ["Day", "Spent"],
        rows: days.map((d) => [formatShortDate(d.date), dollars(d.cents)]),
      }}
      tableMode={table}
      after={
        legend && (
          <Legend
            className={chart.legendGap}
            items={[
              { label: previousName, colour: "ghost", kind: "square" },
              { label: currentName, colour: "neg", kind: "square" },
            ]}
          />
        )
      }
    >
      <div className={chart.plot} style={{ height }} {...pointer.bind}>
        {typical && (
          <span className={styles.rule} style={{ top: height - typical.cents * scale }} />
        )}
        <span className={cx(styles.rule, styles.zero)} style={{ top: height - 1 }} />
        <div
          className={styles.columns}
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {days.map((d, i) => (
            <span key={d.date} className={styles.column}>
              <span
                className={cx(styles.bar, styles.daily, styles.up)}
                style={{
                  bottom: 1,
                  height: Math.max(0, d.cents * scale - 1),
                  background: i < splitAt ? "var(--ghost)" : "var(--neg)",
                }}
              />
            </span>
          ))}
        </div>
        {typical && (
          <span
            className={cx(chart.label, chart.right, chart.onTop)}
            style={{ top: height - typical.cents * scale - 17 }}
          >
            {typical.label}
          </span>
        )}
        {active !== null && days[active] && (
          <ChartTooltip
            className={chart.tip}
            title={formatShortDate(days[active].date)}
            rows={[
              {
                label: active < splitAt ? previousName : currentName,
                value: dollars(days[active].cents),
                colour: active < splitAt ? "ghost" : "neg",
              },
            ]}
            style={{ left: `${activePct}%`, top: -8, transform: tooltipShift(activePct) }}
          />
        )}
      </div>
      <AxisSlots
        labels={days.map((d) => DAY_LETTERS[dayOfWeek(d.date)])}
        on={todayIndex >= 0 ? todayIndex : null}
      />
    </ChartFrame>
  );
}
