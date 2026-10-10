import type { CSSProperties } from "react";
import { cx } from "./cx";
import styles from "./Meter.module.css";

/** The tokens a meter or chart part may be drawn in. */
export type DataColour =
  | "pos"
  | "neg"
  | "accent"
  | "good"
  | "warn"
  | "crit"
  | "you"
  | "partner"
  | "shared"
  | "c1"
  | "c2"
  | "c3"
  | "c4"
  | "c5"
  | "c6"
  | "c7"
  | "c-other"
  | "seq1"
  | "seq2"
  | "seq3"
  | "seq4"
  | "debt1"
  | "debt2"
  | "ghost";

export const colourVar = (colour: DataColour) => `var(--${colour})`;

const percent = (part: number, whole: number) =>
  whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0;

type BarMeterProps = {
  value: number;
  max: number;
  /** What the meter measures, such as "Groceries spent so far". */
  label: string;
  /** The amount in words, such as "$1,040 of $2,220". Screen readers read it instead of numbers. */
  valueText?: string;
  /** Money out is neg (red), money kept is pos (green). */
  colour?: DataColour;
  /** How far through the period today is, from 0 to 1. Draws the 2px today tick. */
  today?: number;
  size?: "md" | "lg";
  className?: string;
};

/** How much of something is used, with an optional tick for where today falls. */
export function BarMeter({
  value,
  max,
  label,
  valueText,
  colour = "neg",
  today,
  size = "md",
  className,
}: BarMeterProps) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(Math.max(value, 0), max)}
      aria-valuetext={valueText}
      className={cx(styles.bar, size === "lg" && styles.lg, className)}
    >
      <div
        className={styles.fill}
        style={{ width: `${percent(value, max)}%`, background: colourVar(colour) }}
      />
      {today !== undefined && (
        <div className={styles.today} style={{ left: `${percent(today, 1)}%` }} />
      )}
    </div>
  );
}

export type StackPart = { label: string; value: number; colour: DataColour };

type StackedBarProps = {
  /** What the whole bar shows, such as "What you own". */
  label: string;
  parts: readonly StackPart[];
  /** Words for each part's value, such as formatted money. Defaults to the share of the whole. */
  formatValue?: (value: number) => string;
  height?: number;
  className?: string;
};

/** Parts of a whole side by side, with 2px gaps. The numbers belong in a list next to it. */
export function StackedBar({ label, parts, formatValue, height, className }: StackedBarProps) {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  const words = parts
    .map(
      (p) =>
        `${p.label} ${formatValue ? formatValue(p.value) : `${Math.round(percent(p.value, total))}%`}`,
    )
    .join(", ");
  const style: CSSProperties | undefined = height ? { height } : undefined;
  return (
    <div
      role="img"
      aria-label={`${label}: ${words}`}
      className={cx(styles.stack, className)}
      style={style}
    >
      {parts
        .filter((p) => p.value > 0)
        .map((part) => (
          <span
            key={part.label}
            className={styles.part}
            style={{ flexGrow: part.value, flexBasis: 0, background: colourVar(part.colour) }}
          />
        ))}
    </div>
  );
}
