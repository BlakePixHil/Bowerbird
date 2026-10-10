import type { ReactNode } from "react";
import { colourVar, type DataColour } from "@/components/ui";
import { ringDash, ringTick, n1 } from "./paths";
import styles from "./Ring.module.css";

type ProgressRingProps = {
  /** How much is used or saved, from 0 to 1. */
  fraction: number;
  /** Where you'd expect to be by today, from 0 to 1. Draws a tick across the ring. */
  expected?: number;
  /** States the numbers, such as "Spent $3,112 of $5,180. Expected by today $3,263." */
  label: string;
  size?: number;
  stroke?: number;
  /** neg (red) for spending, pos (green) for saving. */
  colour?: DataColour;
  /** Shown in the middle, such as "$2,068 left". */
  children?: ReactNode;
};

/** A ring that fills clockwise from the top, with an optional tick for where today should be. */
export function ProgressRing({
  fraction,
  expected,
  label,
  size = 140,
  stroke = 12,
  colour = "neg",
  children,
}: ProgressRingProps) {
  const centre = size / 2;
  const r = centre - stroke / 2 - (expected === undefined ? 2 : stroke / 2);
  const tick = expected === undefined ? null : ringTick(expected, centre, r, stroke - 2);
  return (
    <div
      role="img"
      aria-label={label}
      className={styles.ring}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={centre}
          cy={centre}
          r={r}
          className={styles.track}
          style={{ strokeWidth: stroke }}
        />
        {fraction > 0 && (
          <circle
            cx={centre}
            cy={centre}
            r={r}
            transform={`rotate(-90 ${centre} ${centre})`}
            className={styles.fill}
            style={{
              stroke: colourVar(colour),
              strokeWidth: stroke,
              strokeDasharray: ringDash(fraction, r),
            }}
          />
        )}
        {tick && (
          <line
            className={styles.tick}
            x1={n1(tick.x1)}
            y1={n1(tick.y1)}
            x2={n1(tick.x2)}
            y2={n1(tick.y2)}
          />
        )}
      </svg>
      {children && (
        <div className={styles.centre} aria-hidden="true">
          {children}
        </div>
      )}
    </div>
  );
}
