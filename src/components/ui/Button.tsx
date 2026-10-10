import Link from "next/link";
import type { ComponentProps } from "react";
import styles from "./Button.module.css";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

export type ButtonLook = {
  /** default is the quiet grey button, primary the one blue action on a screen, ghost has no box. */
  variant?: "default" | "primary" | "ghost";
  /** md is 36px tall, lg 44px for the main action on a phone screen. */
  size?: "md" | "lg";
  /** Fill the width of the container. */
  block?: boolean;
  /** An icon before the words. */
  icon?: IconName;
};

function buttonClass(
  { variant = "default", size = "md", block = false }: ButtonLook,
  className?: string,
) {
  return cx(
    styles.button,
    variant !== "default" && styles[variant],
    size === "lg" && styles.lg,
    block && styles.block,
    "hit",
    className,
  );
}

export function Button({
  variant,
  size,
  block,
  icon,
  className,
  children,
  type = "button",
  ...rest
}: ButtonLook & ComponentProps<"button">) {
  return (
    <button type={type} className={buttonClass({ variant, size, block }, className)} {...rest}>
      {icon && <Icon name={icon} size="sm" />}
      {children}
    </button>
  );
}

/** A link that looks like a button, for moving to another page. */
export function ButtonLink({
  variant,
  size,
  block,
  icon,
  className,
  children,
  ...rest
}: ButtonLook & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass({ variant, size, block }, className)} {...rest}>
      {icon && <Icon name={icon} size="sm" />}
      {children}
    </Link>
  );
}

type IconButtonLook = {
  icon: IconName;
  /** What the button does, read out by screen readers and shown on hover. */
  label: string;
  /** Draw a card-coloured box around it, as in page headers. */
  boxed?: boolean;
};

export function IconButton({
  icon,
  label,
  boxed = false,
  className,
  type = "button",
  ...rest
}: IconButtonLook & Omit<ComponentProps<"button">, "children" | "aria-label">) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(styles.iconButton, boxed && styles.boxed, className)}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}

export function IconButtonLink({
  icon,
  label,
  boxed = false,
  className,
  ...rest
}: IconButtonLook & Omit<ComponentProps<typeof Link>, "children" | "aria-label">) {
  return (
    <Link
      aria-label={label}
      title={label}
      className={cx(styles.iconButton, boxed && styles.boxed, className)}
      {...rest}
    >
      <Icon name={icon} />
    </Link>
  );
}

/** A blue text link, with an optional icon after the words (such as chevron-right). */
export function TextLink({
  icon,
  className,
  children,
  ...rest
}: { icon?: IconName } & ComponentProps<typeof Link>) {
  return (
    <Link className={cx(styles.link, "hit", className)} {...rest}>
      {children}
      {icon && <Icon name={icon} size="sm" />}
    </Link>
  );
}
