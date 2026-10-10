"use client";

import { ChartTooltip, colourVar, cx, type DataColour, type TooltipRow } from "@/components/ui";
import { daysBetween, formatShortDate, addDays, type PlainDate } from "@/lib/money";
import styles from "./Chart.module.css";
import { axisDate, dollars } from "./format";
import { areaPath, bandPath, linePath, n1, type XY } from "./paths";
import { headroom, linear, tooltipShift } from "./scale";
import {
  AxisRow,
  ChartFrame,
  Legend,
  useChartPointer,
  type AxisLabel,
  type LegendItem,
  type TableMode,
} from "./shared";

export type DayPoint = { date: PlainDate; cents: number };
export type RangePoint = { date: PlainDate; low: number; high: number };

type Series = { name: string; points: readonly DayPoint[] };

export type RunningTotalChartProps = {
  /** What the chart shows, such as "Everyday spending in October". Starts the screen reader label. */
  label: string;
  /** The first and last day across the bottom. */
  start: PlainDate;
  end: PlainDate;
  /** neg for money going out (spending), pos for money kept (a balance). */
  tone: "neg" | "pos";
  /** This period so far, as a running total for each day. */
  actual: Series & { area?: boolean };
  /** The same point in the last period, in grey. `start` is that period's first day. */
  previous?: Series & { start: PlainDate };
  /** The plan, drawn as a hairline. Two points make a straight pace line. */
  plan?: Series;
  /** Where it's heading, dotted. Start it at the last actual point so the lines join. */
  forecast?: Series & { label?: string };
  /** The likely range around the forecast, as a soft wash. */
  range?: { name: string; points: readonly RangePoint[] };
  /** Flat lines across the chart. A guide is grey with its label on the left; an alert is amber. */
  guides?: readonly { cents: number; label?: string; alert?: boolean }[];
  /** Small dots on the line, such as bills coming out. */
  events?: readonly { date: PlainDate; label: string }[];
  /** Upright lines with a label above, such as paydays. */
  markers?: readonly { date: PlainDate; label: string; faded?: boolean }[];
  /** Labelled dots, such as today's total or the lowest point. */
  callouts?: readonly {
    date: PlainDate;
    cents: number;
    label: string;
    colour?: DataColour;
    strong?: boolean;
    below?: boolean;
  }[];
  /** Draws the today line and the TODAY label. */
  today?: PlainDate;
  /** More dates to label along the bottom. */
  ticks?: readonly PlainDate[];
  height?: number;
  /** Show the legend under the chart. On by default when there are two or more series. */
  legend?: boolean;
  table?: TableMode;
  /** Replaces the screen reader label written from the numbers. */
  summary?: string;
};

const W = 1000;

/** Where a label sits next to a point at `percent` across, so it never runs off the edge. */
function labelShift(percent: number): string {
  if (percent < 8) return "translateX(-4px)";
  if (percent > 92) return "translateX(calc(-100% + 4px))";
  return "translateX(-50%)";
}

/**
 * A running total across a period, such as spending so far this month or the balance until
 * payday, with every layer the reports need. Each layer is optional.
 */
export function RunningTotalChart(props: RunningTotalChartProps) {
  const {
    label,
    start,
    end,
    tone,
    actual,
    previous,
    plan,
    forecast,
    range,
    guides = [],
    events = [],
    markers = [],
    callouts = [],
    today,
    ticks = [],
    height = 132,
    table = "hidden",
  } = props;

  const days = daysBetween(start, end) + 1;
  const offset = (date: PlainDate) => daysBetween(start, date);
  const previousOffset = (date: PlainDate) => daysBetween(previous!.start, date);

  const values = [
    ...actual.points.map((p) => p.cents),
    ...(previous?.points.map((p) => p.cents) ?? []),
    ...(plan?.points.map((p) => p.cents) ?? []),
    ...(forecast?.points.map((p) => p.cents) ?? []),
    ...(range?.points.flatMap((p) => [p.low, p.high]) ?? []),
    ...guides.map((g) => g.cents),
  ];
  const lo = Math.min(0, ...values);
  const hi = headroom(values);
  const x = linear([0, Math.max(days - 1, 1)], [0, W]);
  const y = linear([lo, hi], [height, 0]);
  const pct = (o: number) => (x(o) / W) * 100;

  const toXY = (points: readonly DayPoint[], at = offset): XY[] =>
    [...points].sort((a, b) => at(a.date) - at(b.date)).map((p) => [x(at(p.date)), y(p.cents)]);

  const byDay = (points: readonly DayPoint[] | undefined, at = offset) =>
    new Map((points ?? []).map((p) => [at(p.date), p.cents]));
  // A plan or forecast given as a few points still has a value on every day in between.
  const everyDay = (points: readonly DayPoint[] | undefined) => {
    const known = [...byDay(points)].sort(([a], [b]) => a - b);
    const filled = new Map(known);
    for (let i = 1; i < known.length; i++) {
      const [[o0, v0], [o1, v1]] = [known[i - 1], known[i]];
      const along = linear([o0, o1], [v0, v1]);
      for (let o = o0 + 1; o < o1; o++) filled.set(o, Math.round(along(o)));
    }
    return filled;
  };
  const actualAt = byDay(actual.points);
  const forecastAt = everyDay(forecast?.points);
  const previousAt = previous ? byDay(previous.points, previousOffset) : new Map<number, number>();
  const planAt = everyDay(plan?.points);
  const rangeAt = new Map((range?.points ?? []).map((p) => [offset(p.date), p]));
  const lineAt = (o: number) => actualAt.get(o) ?? forecastAt.get(o) ?? previousAt.get(o);

  const pointer = useChartPointer(days, "points");
  const active = pointer.active;

  const actualXY = toXY(actual.points);
  const lastActual = actual.points.at(-1);
  const lastForecast = forecast?.points.at(-1);

  const seriesCount = [actual, previous, plan, forecast, range].filter(Boolean).length;
  const legendItems: LegendItem[] = [
    { label: actual.name, colour: tone, kind: "line" },
    ...(previous ? [{ label: previous.name, colour: "ghost", kind: "line" } as const] : []),
    ...(plan ? [{ label: plan.name, colour: "text-3", kind: "hairline" } as const] : []),
    ...(forecast ? [{ label: forecast.name, colour: tone, kind: "dotted" } as const] : []),
    ...(range ? [{ label: range.name, colour: tone, kind: "wash" } as const] : []),
    ...(events.length ? [{ label: "Bill", colour: "text-2", kind: "dot" } as const] : []),
  ];

  const summary =
    props.summary ??
    [
      `${label}.`,
      lastActual &&
        `${actual.name}: ${dollars(lastActual.cents)} by ${formatShortDate(lastActual.date)}.`,
      lastForecast &&
        forecast &&
        `${forecast.name}: ${dollars(lastForecast.cents)} by ${formatShortDate(lastForecast.date)}.`,
      plan?.points.at(-1) && `${plan.name}: ${dollars(plan.points.at(-1)!.cents)}.`,
      previous &&
        lastActual &&
        previousAt.has(offset(lastActual.date)) &&
        `${previous.name}: ${dollars(previousAt.get(offset(lastActual.date))!)} at the same point.`,
      ...guides.filter((g) => g.alert && g.label).map((g) => `${g.label}.`),
    ]
      .filter(Boolean)
      .join(" ");

  const columns = [
    "Day",
    actual.name,
    ...(forecast ? [forecast.name] : []),
    ...(range ? [range.name] : []),
    ...(previous ? [previous.name] : []),
    ...(plan ? [plan.name] : []),
  ];
  const rows: string[][] = [];
  for (let o = 0; o < days; o++) {
    const cells = [
      actualAt.get(o),
      ...(forecast ? [forecastAt.get(o)] : []),
      ...(range ? [rangeAt.get(o)] : []),
      ...(previous ? [previousAt.get(o)] : []),
      ...(plan ? [planAt.get(o)] : []),
    ];
    if (cells.every((c) => c === undefined)) continue;
    rows.push([
      formatShortDate(addDays(start, o)),
      ...cells.map((c) =>
        c === undefined
          ? ""
          : typeof c === "number"
            ? dollars(c)
            : `${dollars(c.low)} to ${dollars(c.high)}`,
      ),
    ]);
  }

  const axisLabels: AxisLabel[] = [
    { at: 0, label: axisDate(start) },
    { at: 1, label: axisDate(end) },
    ...ticks.map((t) => ({ at: offset(t) / (days - 1), label: axisDate(t) })),
    ...(today ? [{ at: offset(today) / (days - 1), label: "TODAY", on: true }] : []),
  ];

  const tooltipRows = (o: number): TooltipRow[] => {
    const rows: TooltipRow[] = [];
    if (actualAt.has(o))
      rows.push({ label: actual.name, value: dollars(actualAt.get(o)!), colour: tone, line: true });
    else if (forecast && forecastAt.has(o))
      rows.push({
        label: forecast.name,
        value: dollars(forecastAt.get(o)!),
        colour: tone,
        line: true,
      });
    const band = rangeAt.get(o);
    if (range && band)
      rows.push({ label: range.name, value: `${dollars(band.low)} to ${dollars(band.high)}` });
    if (previous && previousAt.has(o))
      rows.push({
        label: previous.name,
        value: dollars(previousAt.get(o)!),
        colour: "ghost",
        line: true,
      });
    if (plan && planAt.has(o)) rows.push({ label: plan.name, value: dollars(planAt.get(o)!) });
    for (const e of events) if (offset(e.date) === o) rows.push({ label: e.label, value: "" });
    return rows;
  };

  return (
    <ChartFrame
      summary={summary}
      table={{ caption: label, columns, rows }}
      tableMode={table}
      after={
        (props.legend ?? seriesCount > 1) && (
          <Legend items={legendItems} className={styles.legendGap} />
        )
      }
    >
      <div className={styles.room}>
        <div className={styles.plot} style={{ height }} {...pointer.bind}>
          <svg
            className={styles.svg}
            viewBox={`0 0 ${W} ${height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {guides
              .filter((g) => !g.alert)
              .map((g) => (
                <line
                  key={`g${g.cents}`}
                  className={styles.grid}
                  x1={0}
                  x2={W}
                  y1={n1(y(g.cents))}
                  y2={n1(y(g.cents))}
                />
              ))}
            {markers.map((m) => (
              <line
                key={`m${m.date}`}
                className={styles.grid}
                x1={n1(x(offset(m.date)))}
                x2={n1(x(offset(m.date)))}
                y1={0}
                y2={height}
                opacity={m.faded ? 0.45 : undefined}
              />
            ))}
            {today && (
              <line
                className={styles.grid}
                x1={n1(x(offset(today)))}
                x2={n1(x(offset(today)))}
                y1={0}
                y2={height}
              />
            )}
            {guides
              .filter((g) => g.alert)
              .map((g) => (
                <line
                  key={`a${g.cents}`}
                  className={styles.alert}
                  x1={0}
                  x2={W}
                  y1={n1(y(g.cents))}
                  y2={n1(y(g.cents))}
                />
              ))}
            <line className={styles.axis} x1={0} x2={W} y1={height - 0.5} y2={height - 0.5} />
            {lo < 0 && <line className={styles.axis} x1={0} x2={W} y1={n1(y(0))} y2={n1(y(0))} />}
            {plan && <path className={styles.hairline} d={linePath(toXY(plan.points))} />}
            {previous && (
              <path
                className={styles.line}
                style={{ stroke: "var(--ghost)" }}
                d={linePath(toXY(previous.points, previousOffset))}
              />
            )}
            {range && range.points.length > 0 && (
              <path
                style={{ fill: `var(--${tone}-wash)` }}
                d={bandPath(
                  [...range.points].map((p) => [x(offset(p.date)), y(p.high)] as const),
                  [...range.points].map((p) => [x(offset(p.date)), y(p.low)] as const),
                )}
              />
            )}
            {actual.area && actualXY.length > 1 && (
              <path style={{ fill: `var(--${tone}-wash)` }} d={areaPath(actualXY, height)} />
            )}
            {forecast && (
              <path
                className={styles.forecast}
                style={{ stroke: colourVar(tone) }}
                d={linePath(toXY(forecast.points))}
              />
            )}
            <path
              className={styles.line}
              style={{ stroke: colourVar(tone) }}
              d={linePath(actualXY)}
            />
          </svg>

          {events.map((e) => {
            const v = lineAt(offset(e.date));
            if (v === undefined) return null;
            return (
              <span
                key={`e${e.date}${e.label}`}
                className={cx(styles.dot, styles.dotSm)}
                style={{ left: `${pct(offset(e.date))}%`, top: y(v), background: "var(--text-2)" }}
              />
            );
          })}

          {callouts.map((c) => {
            const p = pct(offset(c.date));
            return (
              <span key={`c${c.date}${c.label}`}>
                <span
                  className={styles.dot}
                  style={{
                    left: `${p}%`,
                    top: y(c.cents),
                    background: colourVar(c.colour ?? tone),
                  }}
                />
                <span
                  className={cx(styles.label, c.strong && styles.strong)}
                  style={{
                    left: `${p}%`,
                    top: y(c.cents) + (c.below ? 10 : -28),
                    transform: labelShift(p),
                  }}
                >
                  {c.label}
                </span>
              </span>
            );
          })}

          {guides
            .filter((g) => g.label)
            .map((g) => (
              <span
                key={`l${g.cents}`}
                className={cx(styles.label, g.alert && styles.right)}
                style={{ left: g.alert ? undefined : 0, top: y(g.cents) - (g.alert ? 17 : 20) }}
              >
                {g.label}
              </span>
            ))}

          {forecast?.label && lastForecast && (
            <span
              className={cx(styles.label, styles.right)}
              style={{ top: y(lastForecast.cents) - 22 }}
            >
              {forecast.label}
            </span>
          )}

          {markers.map((m) => (
            <span
              key={`ml${m.date}`}
              className={cx(styles.label, styles.centred)}
              style={{
                left: `${pct(offset(m.date))}%`,
                top: -22,
                opacity: m.faded ? 0.6 : undefined,
              }}
            >
              {m.label}
            </span>
          ))}

          {active !== null && (
            <>
              <span className={styles.crosshair} style={{ left: `${pct(active)}%` }} />
              {lineAt(active) !== undefined && (
                <span
                  className={styles.dot}
                  style={{
                    left: `${pct(active)}%`,
                    top: y(lineAt(active)!),
                    background: "var(--text)",
                  }}
                />
              )}
              <ChartTooltip
                className={styles.tip}
                title={formatShortDate(addDays(start, active))}
                rows={tooltipRows(active)}
                style={{ left: `${pct(active)}%`, transform: tooltipShift(pct(active)) }}
              />
            </>
          )}
        </div>
      </div>
      <AxisRow labels={axisLabels} />
    </ChartFrame>
  );
}
