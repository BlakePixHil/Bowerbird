"use client";

import { useId } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import styles from "./SegmentedControl.module.css";

export type SegmentOption<T extends string> = { value: T; label: string; icon?: IconName };

type SegmentedControlProps<T extends string> = {
  /** Names the whole group for screen readers, such as "Whose money". */
  label: string;
  options: readonly SegmentOption<T>[];
  /** The chosen value, when the screen keeps track of it. */
  value?: T;
  /** The starting value, when the control sits in a form and keeps track itself. */
  defaultValue?: T;
  onChange?: (value: T) => void;
  /** The form field name. */
  name?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Pick one of a few options, such as Mine, Partner's, Shared or Household. Built from real radio
 * buttons, so arrow keys and forms work without extra code.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  defaultValue,
  onChange,
  name,
  disabled,
  className,
}: SegmentedControlProps<T>) {
  const groupName = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cx(styles.seg, className)}>
      {options.map((option) => (
        <label key={option.value} className={cx(styles.option, "hit")}>
          <input
            type="radio"
            className="sr-only"
            name={name ?? groupName}
            value={option.value}
            disabled={disabled}
            checked={value === undefined ? undefined : value === option.value}
            defaultChecked={defaultValue === undefined ? undefined : defaultValue === option.value}
            onChange={() => onChange?.(option.value)}
          />
          <span className={styles.face}>
            {option.icon && <Icon name={option.icon} size="sm" />}
            <span>{option.label}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
