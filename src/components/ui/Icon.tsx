import type { SVGProps } from "react";
import { cx } from "./cx";
import styles from "./Icon.module.css";
import { ICONS, type IconName } from "./icons";

export type IconSize = "sm" | "md" | "lg";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  name: IconName;
  /** sm is 14px, md 18px, lg 22px. */
  size?: IconSize;
  /** Words for screen readers. Leave it out when words next to the icon already say it. */
  label?: string;
};

/** An inline stroke icon from the design canvas. It takes the colour of the text around it. */
export function Icon({ name, size = "md", label, className, ...rest }: IconProps) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <svg
      viewBox="0 0 24 24"
      focusable="false"
      className={cx(styles.icon, size !== "md" && styles[size], className)}
      {...a11y}
      {...rest}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
