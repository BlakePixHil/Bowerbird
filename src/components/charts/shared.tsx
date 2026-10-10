"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { colourVar, cx, Table, Td, Th, type DataColour } from "@/components/ui";
import styles from "./Chart.module.css";
import { nearestPoint, slotAt } from "./scale";

/**
 * Follows the pointer across a chart and returns the point under it. A mouse shows the tooltip on
 * hover. A tap shows it and keeps it until the next tap somewhere else, and dragging a finger
 * sideways moves it along.
 */
export function useChartPointer(count: number, mode: "points" | "slots") {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const touched = useRef(false);

  const pick = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const box = event.currentTarget.getBoundingClientRect();
      if (box.width === 0 || count === 0) return;
      const fraction = (event.clientX - box.left) / box.width;
      setActive(mode === "points" ? nearestPoint(fraction, count) : slotAt(fraction, count));
    },
    [count, mode],
  );

  useEffect(() => {
    if (active === null || !touched.current) return;
    const clear = (event: globalThis.PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", clear);
    return () => document.removeEventListener("pointerdown", clear);
  }, [active]);

  const bind = {
    ref,
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      touched.current = event.pointerType !== "mouse";
      pick(event);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" || event.buttons > 0) pick(event);
    },
    onPointerLeave: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse") setActive(null);
    },
  };

  return { active, setActive, bind };
}

export type KeyKind = "square" | "line" | "hairline" | "dotted" | "wash" | "dot" | "tick";

export type KeyColour = DataColour | "text" | "text-2" | "text-3";

export type LegendItem = { label: string; colour: KeyColour; kind: KeyKind };

const keyColour = (colour: KeyColour) =>
  colour.startsWith("text") ? `var(--${colour})` : colourVar(colour as DataColour);

/** A small colour key, as used in legends and tooltips. */
export function Key({ colour, kind }: Omit<LegendItem, "label">) {
  const c = keyColour(colour);
  const className = cx(
    styles.key,
    kind === "line" && styles.keyLine,
    kind === "hairline" && styles.keyHairline,
    kind === "dotted" && styles.keyDotted,
    kind === "dot" && styles.keyDot,
    kind === "tick" && styles.keyTick,
  );
  const style =
    kind === "dotted"
      ? { borderColor: c }
      : kind === "wash"
        ? {
            background: `color-mix(in srgb, ${c} 16%, transparent)`,
            boxShadow: `inset 0 0 0 1px ${c}`,
          }
        : { background: c };
  return <span aria-hidden="true" className={className} style={style} />;
}

/** Names every series. Charts with two or more series always show one. */
export function Legend({ items, className }: { items: readonly LegendItem[]; className?: string }) {
  return (
    <ul className={cx(styles.legend, className)}>
      {items.map((item) => (
        <li key={item.label}>
          <Key colour={item.colour} kind={item.kind} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export type AxisLabel = { at: number; label: string; on?: boolean };

/** Date labels under a chart, placed by how far along they are (0 is the left edge, 1 the right). */
export function AxisRow({ labels }: { labels: readonly AxisLabel[] }) {
  return (
    <div className={styles.axisRow} aria-hidden="true">
      {labels.map((l) => {
        const style =
          l.at <= 0
            ? { left: 0 }
            : l.at >= 1
              ? { right: 0 }
              : { left: `${l.at * 100}%`, transform: "translateX(-50%)" };
        return (
          <span
            key={`${l.label}-${l.at}`}
            className={l.on ? styles.axisOn : undefined}
            style={style}
          >
            {l.label}
          </span>
        );
      })}
    </div>
  );
}

/** One label under each bar or point, such as month initials. */
export function AxisSlots({ labels, on }: { labels: readonly string[]; on?: number | null }) {
  return (
    <div
      className={styles.axisSlots}
      style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {labels.map((label, i) => (
        <span key={i} className={i === on ? styles.axisOn : undefined}>
          {label}
        </span>
      ))}
    </div>
  );
}

export type TableMode = "hidden" | "visible" | "none";

export type ChartTableData = {
  caption: string;
  columns: readonly string[];
  rows: ReadonlyArray<readonly string[]>;
};

/**
 * The chart's numbers as a table. Hidden is read by screen readers only, visible shows it on the
 * page too.
 */
export function ChartTable({ data, mode }: { data: ChartTableData; mode: TableMode }) {
  if (mode === "none") return null;
  const table = (
    <Table caption={data.caption} showCaption={false}>
      <thead>
        <tr>
          {data.columns.map((column, i) => (
            <Th key={column} num={i > 0}>
              {column}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row) => (
          <tr key={row[0]}>
            {row.map((cell, i) => (
              <Td key={i} num={i > 0}>
                {cell}
              </Td>
            ))}
          </tr>
        ))}
      </tbody>
    </Table>
  );
  return mode === "visible" ? (
    <div className={styles.table}>{table}</div>
  ) : (
    <div className="sr-only">{table}</div>
  );
}

/**
 * The wrapper every chart uses: the drawing is one image with a label that states the key
 * numbers, and the full numbers follow as a table.
 */
export function ChartFrame({
  summary,
  table,
  tableMode,
  children,
  after,
  interactive = false,
  className,
}: {
  summary: string;
  table: ChartTableData;
  tableMode: TableMode;
  children: ReactNode;
  /** Shown after the drawing but outside the image, such as a legend. */
  after?: ReactNode;
  /** The drawing holds buttons, so it's a labelled group rather than one image. */
  interactive?: boolean;
  className?: string;
}) {
  return (
    <div className={cx(styles.chart, className)}>
      <div role={interactive ? "group" : "img"} aria-label={summary}>
        {children}
      </div>
      {after}
      <ChartTable data={table} mode={tableMode} />
    </div>
  );
}
