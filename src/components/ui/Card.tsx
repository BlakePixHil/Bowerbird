import type { HTMLAttributes } from "react";
import styles from "./Card.module.css";
import { cx } from "./cx";

type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article" | "aside" | "li" | "ol";
};

/** The main surface for a group of content. Padding is up to the screen using it. */
export function Card({ as: Tag = "div", className, ...rest }: SurfaceProps) {
  return <Tag className={cx(styles.card, className)} {...rest} />;
}

/** A sunken area inside a card or sheet, for lists of rows and side notes. */
export function Well({ as: Tag = "div", className, ...rest }: SurfaceProps) {
  return <Tag className={cx(styles.well, className)} {...rest} />;
}

/** A 1px line between groups. */
export function Divider({ className }: { className?: string }) {
  return <hr className={cx(styles.divider, className)} />;
}
