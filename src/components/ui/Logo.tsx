import type { ElementType } from "react";
import { APP_NAME } from "@/config/app";
import { cx } from "./cx";
import styles from "./Logo.module.css";

/**
 * The B drawn as a baseline and two rounded bars, from the "Logo and app icon" board. The same path
 * as brand/mark.svg, which the app icons are built from.
 */
export const MARK_PATH =
  "M10.5 10.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v27a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2zM20 10.5a2 2 0 0 1 2-2h4.5a6.25 6.25 0 0 1 0 12.5H22a2 2 0 0 1-2-2zM31.2 11.4Q35.9 12.6 37.4 15.6a0.9 0.9 0 0 1-0.9 1.2Q34.0 17.0 31.5 18.6zM20 25a2 2 0 0 1 2-2h7.5a8.25 8.25 0 0 1 0 16.5H22a2 2 0 0 1-2-2zM28.9 13.5a1.5 1.5 0 1 0 -3.0 0a1.5 1.5 0 1 0 3.0 0z";

/** The app icon: the white mark on the blue gradient tile. Decoration unless given a label. */
export function LogoMark({
  size = 40,
  label,
  className,
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <span className={cx(styles.mark, className)} style={{ width: size, height: size }} {...a11y}>
      <svg viewBox="0 0 48 48" focusable="false">
        <path d={MARK_PATH} />
      </svg>
    </span>
  );
}

/** How tight the wordmark sits at each size, from the board's lockups: tighter as it grows. */
const tracking = (fontSize: number) =>
  fontSize >= 34 ? "-0.045em" : fontSize >= 28 ? "-0.04em" : "-0.035em";

/** The app's name in Geist Semibold, tightened. Always "Bowerbird", one word, capital B. */
export function Wordmark({
  as: Tag = "span",
  fontSize = 20,
  className,
}: {
  /** Such as "h1" when the name is the page's heading. */
  as?: ElementType;
  fontSize?: number;
  className?: string;
}) {
  return (
    <Tag
      className={cx(styles.wordmark, className)}
      style={{ fontSize, letterSpacing: tracking(fontSize) }}
    >
      {APP_NAME}
    </Tag>
  );
}

/** The mark with the app's name next to it. The text size sets the size of both. */
export function Logo({ fontSize = 20, className }: { fontSize?: number; className?: string }) {
  return (
    <span className={cx(styles.lockup, className)} style={{ fontSize }}>
      <LogoMark size={Math.round(fontSize * 1.25)} />
      <Wordmark fontSize={fontSize} />
    </span>
  );
}
