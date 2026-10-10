import { useId, type ComponentProps, type ReactNode } from "react";
import { cx } from "./cx";
import styles from "./Field.module.css";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

type TextFieldProps = Omit<ComponentProps<"input">, "id" | "size"> & {
  label: string;
  /** Keep the label for screen readers only, such as on a search box with an icon. */
  hideLabel?: boolean;
  icon?: IconName;
  /** Something at the end of the box, such as a keyboard hint or a unit. */
  trailing?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
};

/** A labelled 44px text box. Hints and errors are linked to the input for screen readers. */
export function TextField({
  label,
  hideLabel = false,
  icon,
  trailing,
  hint,
  error,
  className,
  type = "text",
  ...rest
}: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cx(styles.wrap, className)}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : styles.label}>
        {label}
      </label>
      <div className={cx(styles.field, Boolean(error) && styles.invalid)}>
        {icon && <Icon name={icon} size="sm" />}
        <input
          id={id}
          type={type}
          aria-invalid={error ? true : undefined}
          aria-describedby={cx(hintId, errorId) || undefined}
          {...rest}
        />
        {trailing}
      </div>
      {hint && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className={styles.error}>
          <Icon name="alert" size="sm" />
          {error}
        </span>
      )}
    </div>
  );
}

type SelectFieldProps = Omit<ComponentProps<"select">, "id" | "children"> & {
  label: string;
  options: readonly { value: string; label: string }[];
  hint?: ReactNode;
  className?: string;
};

/** A labelled 44px choice of a few options, drawn like a text box. A real select underneath. */
export function SelectField({ label, options, hint, className, ...rest }: SelectFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cx(styles.wrap, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={cx(styles.field, styles.select)}>
        <select id={id} aria-describedby={hintId} {...rest}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size="sm" />
      </div>
      {hint && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
    </div>
  );
}

type ChoiceProps = Omit<ComponentProps<"input">, "type" | "children"> & {
  /** The words next to the control. They're its label. */
  children: ReactNode;
  className?: string;
};

/** A checkbox with its words. A real checkbox underneath, so forms and keys just work. */
export function Checkbox({ children, className, ...rest }: ChoiceProps) {
  return (
    <label className={cx(styles.choice, "hit", className)}>
      <input type="checkbox" className="sr-only" {...rest} />
      <span className={styles.box} aria-hidden="true">
        <Icon name="check" size="sm" />
      </span>
      <span>{children}</span>
    </label>
  );
}

/** An on and off switch with its words, such as "Alerts on". */
export function Switch({ children, className, ...rest }: ChoiceProps) {
  return (
    <label className={cx(styles.choice, "hit", className)}>
      <input type="checkbox" role="switch" className="sr-only" {...rest} />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
      </span>
      <span>{children}</span>
    </label>
  );
}
