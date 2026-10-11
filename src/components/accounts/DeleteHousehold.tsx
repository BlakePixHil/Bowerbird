"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useOnline } from "@/components/offline/online";
import { Button, ButtonLink, cx, TextField, TextLink } from "@/components/ui";
import { LIVE_SYNC_PROVIDER as P } from "@/config/app";
import { sameName } from "@/lib/access/confirm";
import { deleteEverything } from "./actions";
import styles from "./Accounts.module.css";

/**
 * Delete the household, from the Danger zone on "Desktop: Accounts and sharing": what goes, a
 * reminder to export first and, with live sync, to remove the banks in the provider too, then the
 * household's name typed to confirm. Desktop starts with just the button; a phone's own page
 * starts open.
 */
export function DeleteHousehold({
  householdName,
  liveSync,
  open: startOpen = false,
}: {
  householdName: string;
  /** The household has live sync, so the provider still holds bank connections afterwards. */
  liveSync: boolean;
  open?: boolean;
}) {
  const online = useOnline();
  const [open, setOpen] = useState(startOpen);
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, startDeleting] = useTransition();
  const ready = sameName(typed, householdName);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    setProblem(null);
    startDeleting(async () => {
      // On success this goes to the goodbye page and never comes back here.
      const failed = await deleteEverything({ name: typed });
      if (failed) setProblem(failed.error);
    });
  }

  return (
    <div className={styles.dangerBox}>
      <div className={styles.dangerHead}>
        <div className="grow">
          {/* Its own page already says so in the heading. */}
          {!startOpen && <p className={styles.dangerTitle}>Delete the household</p>}
          <p className="small sub">
            Erases all of its data for good.{" "}
            <TextLink href="/api/export" download prefetch={false}>
              Export everything
            </TextLink>{" "}
            first if you want a copy.
          </p>
        </div>
        {!open && (
          <Button icon="trash" onClick={() => setOpen(true)} className={styles.danger}>
            Delete the household
          </Button>
        )}
      </div>
      {open && (
        <form onSubmit={submit} className={styles.dangerForm} noValidate>
          <ul className={cx("small", styles.goes)}>
            <li>
              Every account, transaction, balance, budget, category, rule and file import in{" "}
              {householdName}.
            </li>
            <li>Everyone in it, with their passkeys. They&apos;re all signed out.</li>
            {liveSync && (
              <li>
                Live sync&apos;s access link. {P.name} still has your banks connected afterwards, so
                remove them there too, and cancel the plan if you&apos;re done with it.
              </li>
            )}
            <li>There&apos;s no undo.</li>
          </ul>
          <TextField
            label={`Type ${householdName} to confirm`}
            name="confirm"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.currentTarget.value)}
            error={problem ?? undefined}
          />
          {!online && <p className="small muted">Deleting needs a connection.</p>}
          <div className={styles.dangerActions}>
            {!startOpen && (
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Keep it
              </Button>
            )}
            {startOpen && (
              <ButtonLink href="/accounts" variant="ghost">
                Keep it
              </ButtonLink>
            )}
            <Button
              type="submit"
              icon="trash"
              disabled={!ready || !online || busy}
              className={styles.dangerGo}
            >
              {busy ? "Deleting…" : "Delete everything"}
            </Button>
          </div>
          <span className="sr-only" aria-live="polite">
            {busy ? "Deleting the household" : ""}
          </span>
        </form>
      )}
    </div>
  );
}
