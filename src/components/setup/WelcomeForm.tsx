"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button, cx, Tile, TextField, type IconName } from "@/components/ui";
import { APP_NAME } from "@/config/app";
import { NAME_MAX, type WelcomeSaved } from "@/lib/first-run/rules";
import { saveWelcomeStep } from "./actions";
import styles from "./Setup.module.css";

const PROMISES: readonly { icon: IconName; title: string; text: string }[] = [
  {
    icon: "eye",
    title: "Read-only. It never moves money.",
    text: "It sees balances and transactions. It can’t pay, transfer or change anything.",
  },
  {
    icon: "download",
    title: "Your data, yours to keep",
    text: "Export everything or delete it all, any time.",
  },
  {
    icon: "piggy",
    title: "Free to run",
    text: "Upload bank files for free. Live bank sync is an optional extra.",
  },
];

/** Step 1: your name, what to call the household, and what the app promises. */
export function WelcomeForm({
  name,
  household,
  owner,
}: {
  name: string;
  household: string;
  /** Only the Owner names the household. */
  owner: boolean;
}) {
  const [problem, setProblem] = useState<Extract<WelcomeSaved, { ok: false }> | null>(null);
  const [busy, startSaving] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setProblem(null);
    startSaving(async () => {
      const saved = await saveWelcomeStep({
        name: data.get("name"),
        household: data.get("household") ?? "",
      });
      if (!saved.ok) setProblem(saved);
    });
  }

  return (
    <form onSubmit={submit} className={styles.body} noValidate>
      <div className={styles.fields}>
        <TextField
          label="Your name"
          name="name"
          icon="user"
          autoComplete="given-name"
          defaultValue={name}
          required
          maxLength={NAME_MAX}
          error={problem?.field === "name" ? problem.error : undefined}
        />
        {owner && (
          <TextField
            label="What to call your household"
            name="household"
            icon="home"
            autoComplete="off"
            defaultValue={household}
            required
            maxLength={NAME_MAX}
            error={problem?.field === "household" ? problem.error : undefined}
          />
        )}
        <p className={cx("muted small", styles.fieldsNote)}>
          It&apos;s just you for now. You can invite your partner later.
        </p>
      </div>

      <ul className={styles.promises} aria-label={`What ${APP_NAME} promises`}>
        {PROMISES.map((promise) => (
          <li key={promise.icon} className={styles.promise}>
            <Tile icon={promise.icon} size="sm" tone="accent" />
            <div>
              <h2 className={cx("h2", styles.promiseTitle)}>{promise.title}</h2>
              <p className={cx("sub small", styles.promiseText)}>{promise.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className={cx(styles.actions, styles.actionsEnd)}>
        <p role="alert" className={styles.problem}>
          {problem?.field === null ? problem.error : null}
        </p>
        <Button type="submit" variant="primary" size="lg" disabled={busy} className={styles.go}>
          {busy ? "Saving…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
