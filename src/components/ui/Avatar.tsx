import styles from "./Avatar.module.css";
import { cx } from "./cx";

export type Owner = "you" | "partner" | "shared";

type AvatarProps = {
  /** Whose money this is. Sets the ring colour: you blue, partner pink, shared amber. */
  owner: Owner;
  /** One or two letters. */
  initials: string;
  /** The full name or "Shared", read by screen readers instead of the letters. */
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function Avatar({ owner, initials, label, size = "md", className }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cx(styles.avatar, size !== "md" && styles[size], styles[owner], className)}
    >
      <span aria-hidden="true">{initials.slice(0, 2).toUpperCase()}</span>
    </span>
  );
}
