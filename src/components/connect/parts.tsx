"use client";

import type { ReactNode, Ref } from "react";
import {
  Button,
  ButtonLink,
  Card,
  cx,
  Icon,
  IconButton,
  IconButtonLink,
  Pill,
  Well,
  type IconName,
} from "@/components/ui";
import { APP_NAME, LIVE_SYNC_PROVIDER } from "@/config/app";
import styles from "./Connect.module.css";

const P = LIVE_SYNC_PROVIDER;

/** The four steps of connecting live sync, as the desktop rail shows them. */
export const STEPS = [
  {
    key: "banks",
    title: `Connect banks in ${P.name}`,
    now: "Approve read-only access",
    later: "At each bank",
    done: `Done in ${P.name}`,
  },
  {
    key: "token",
    title: "Paste setup token",
    now: `Copy it from ${P.name}`,
    later: `From ${P.name}`,
    done: "Looks right",
  },
  {
    key: "pick",
    title: "Pick accounts",
    now: "Choose who sees what",
    later: "Choose who sees what",
    done: "Picked",
  },
  {
    key: "sync",
    title: "First sync",
    now: "Bringing in history",
    later: "Brings in your history",
    done: "Done",
  },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

/** The step rail at the top of the desktop flow. Steps before this one can be gone back to. */
export function StepRail({
  at,
  tokenIn,
  onPick,
  subs = {},
  complete = false,
}: {
  at: StepKey;
  tokenIn?: boolean;
  onPick?: (step: StepKey) => void;
  /** Words under a step's title in place of the usual ones, such as "6 found". */
  subs?: Partial<Record<StepKey, string>>;
  /** The step it's at is finished too, so it gets a tick. */
  complete?: boolean;
}) {
  const now = STEPS.findIndex((step) => step.key === at);
  return (
    <Card as="ol" className={styles.rail} aria-label="Steps to connect live sync">
      {STEPS.map((step, i) => {
        const done = i < now || (complete && i === now);
        const current = i === now;
        const sub =
          subs[step.key] ??
          (done
            ? step.done
            : current
              ? step.key === "token" && tokenIn
                ? "Looks right"
                : step.now
              : step.later);
        const body = (
          <>
            <span className={cx(styles.railBar, i <= now && styles.railBarOn)} />
            <span className={styles.railHead}>
              <span
                className={cx(
                  styles.railNum,
                  done ? styles.numDone : current ? styles.numNow : styles.numLater,
                )}
              >
                {done ? <Icon name="check" size="sm" /> : i + 1}
              </span>
              <span className="grow">
                <span className={cx(styles.railTitle, i > now && styles.railTitleLater)}>
                  {step.title}
                </span>
                <span className={cx("small muted", styles.block)}>{sub}</span>
              </span>
            </span>
          </>
        );
        // Only the steps on this page can be picked; later ones open once the token is in.
        const pickable = onPick && i <= 1 && now <= 1;
        return (
          <li key={step.key} className={styles.railItem}>
            {pickable ? (
              <button
                type="button"
                className={cx(styles.railStep, current && styles.railNow)}
                aria-current={current ? "step" : undefined}
                onClick={() => onPick(step.key)}
              >
                {body}
              </button>
            ) : (
              <div
                className={cx(styles.railStep, current && styles.railNow)}
                aria-current={current ? "step" : undefined}
              >
                {body}
              </div>
            )}
          </li>
        );
      })}
    </Card>
  );
}

/** The phone's top bar: back, "Live sync · step 2 of 3" and the three-part progress line. */
export function PhoneTop({
  step,
  back,
}: {
  step: 1 | 2 | 3;
  back: { href: string; label: string };
}) {
  return (
    <>
      <div className={styles.phoneBar}>
        <IconButtonLink icon="arrow-left" label={back.label} href={back.href} />
        <span className="small sub">Live sync · step {step} of 3</span>
      </div>
      <div className={styles.progress} role="img" aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map((n) => (
          <span key={n} className={cx(n <= step && styles.progressOn)} />
        ))}
      </div>
    </>
  );
}

/** "Open Redbark", in a new tab. */
export function OpenProvider({ className }: { className?: string }) {
  return (
    <ButtonLink
      href={P.url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      aria-label={`Open ${P.name} in a new tab`}
    >
      <span>Open {P.name}</span>
      <Icon name="external" size="sm" />
    </ButtonLink>
  );
}

/**
 * The setup token box: a text box with Paste while it's empty, then the token masked to its last
 * four characters with a way to clear it.
 */
export function TokenField({
  id,
  value,
  last4,
  placeholder,
  onChange,
  onPaste,
  onClear,
  onBlur,
  inputRef,
  describedBy,
  invalid,
  className,
}: {
  id: string;
  value: string;
  /** Set once the token checks out: the box then shows it masked. */
  last4: string | null;
  placeholder: string;
  onChange: (text: string) => void;
  onPaste: () => void;
  onClear: () => void;
  onBlur: () => void;
  inputRef: Ref<HTMLInputElement>;
  describedBy?: string;
  invalid: boolean;
  className?: string;
}) {
  if (last4)
    return (
      <div className={cx(styles.tokenField, styles.tokenGood, className)}>
        <Icon name="key" size="sm" />
        <input
          id={id}
          ref={inputRef}
          className={cx("mono", styles.masked)}
          type="text"
          readOnly
          value={`•••••••••••••••• ${last4}`}
          aria-describedby={describedBy}
        />
        <IconButton
          icon="close"
          label="Clear the setup token"
          onClick={onClear}
          className={styles.clear}
        />
      </div>
    );
  return (
    <div className={cx(styles.tokenField, invalid && styles.tokenBad, className)}>
      <Icon name="key" size="sm" />
      <input
        id={id}
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      <Button icon="paste" className={styles.paste} onClick={onPaste}>
        Paste
      </Button>
    </div>
  );
}

/** "Looks right" under a token that checks out, or what's wrong with it. */
export function TokenStatus({
  id,
  ok,
  okNote,
  problem,
}: {
  id: string;
  ok: boolean;
  okNote: string;
  problem: string | null;
}) {
  if (ok)
    return (
      <div id={id} className={styles.tokenOk}>
        <Pill tone="good">Looks right</Pill>
        <span className="muted small">{okNote}</span>
      </div>
    );
  if (!problem) return null;
  return (
    <p id={id} role="alert" className={cx("small", styles.problem)}>
      <Icon name="alert" size="sm" />
      {problem}
    </p>
  );
}

/** The reassurance under the phone's steps. */
export function KeepsNote() {
  return (
    <Well className={styles.keeps}>
      <Icon name="shield" className={styles.keepsIcon} />
      <p className="small sub">
        <span className={styles.strong}>
          {APP_NAME} keeps only an encrypted access link, never your bank password.
        </span>{" "}
        It can only read, it never moves money. You can cut access any time in {P.name}.
      </p>
    </Well>
  );
}

export const AT_EACH_BANK = [
  `${P.name} sends you to the bank’s own Consumer Data Right consent screen.`,
  "You sign in there, at your bank. Not here.",
  "You approve read-only access to the accounts you choose.",
  `You come back to ${P.name}, which gives you a setup token.`,
];

export const WHAT_IT_KEEPS: { icon: IconName; text: string }[] = [
  { icon: "lock", text: "Only an encrypted access link. Never your bank password." },
  { icon: "eye", text: "Read-only. It can never move money." },
  { icon: "close", text: `You can cut access any time in ${P.name}.` },
  { icon: "upload", text: "Files still work. Importing is free, with or without live sync." },
];

export const WHEN_CONSENT_ENDS = [
  "A banner asks you to reconnect. Everything up to that day stays here.",
  `In ${P.name}, approve that bank again on its consent screen.`,
  "The next sync fills the gap. No new setup token needed.",
];

/** A numbered list in small type, as in "What happens at each bank". */
export function NumberedList({
  items,
  className,
  quiet = false,
}: {
  items: readonly string[];
  className?: string;
  quiet?: boolean;
}) {
  return (
    <ol className={cx("small", styles.numbered, className)}>
      {items.map((text, i) => (
        <li key={text}>
          <span className={cx("mono", styles.numberedNum)}>{i + 1}</span>
          <span className={quiet ? "muted" : "sub"}>{text}</span>
        </li>
      ))}
    </ol>
  );
}

/** "When a bank consent runs out", at the bottom of the desktop side column. */
export function ConsentNote() {
  return (
    <Well as="section" className={styles.consent} aria-labelledby="consent-title">
      <div className={styles.iconHead}>
        <Icon name="clock" size="sm" />
        <h2 id="consent-title" className="h3">
          When a bank consent runs out
        </h2>
      </div>
      <p className="small muted">
        Each consent lasts up to 12 months, then the bank asks you to approve it again.
      </p>
      <NumberedList items={WHEN_CONSENT_ENDS} quiet className={styles.consentList} />
    </Well>
  );
}

/** A card with a title. `lead` goes before the title, such as a tile or an icon. */
export function Section({
  title,
  lead,
  side = false,
  children,
}: {
  title: string;
  lead?: ReactNode;
  /** The smaller cards in the side column. */
  side?: boolean;
  children: ReactNode;
}) {
  const heading = <h2 className={cx("h2", !side && styles.sectionTitle)}>{title}</h2>;
  return (
    <Card as="section" className={side ? styles.side : styles.section} aria-label={title}>
      {lead ? (
        <div className={styles.iconHead}>
          {lead}
          {heading}
        </div>
      ) : (
        heading
      )}
      {children}
    </Card>
  );
}
