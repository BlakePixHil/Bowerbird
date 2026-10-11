"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AddPasskeyButton, SignOutButton } from "@/components/auth/AccountActions";
import { useOnline } from "@/components/offline/online";
import { Button, cx, ListRow, Pill, Tile } from "@/components/ui";
import { forgetPasskey } from "./actions";
import styles from "./Accounts.module.css";

/** A passkey, ready to show: "iPhone", "Added Sat 10 Oct · Last used today". */
export type PasskeyItem = { id: string; label: string; detail: string };

const FAILED = "Couldn't remove that. Check your connection and try again.";

/**
 * Your passkeys: one for each phone or computer that signs in. Add one on this device, remove one
 * on a device you no longer have (never the last), and sign out.
 */
export function Passkeys({ keys }: { keys: readonly PasskeyItem[] }) {
  const router = useRouter();
  const online = useOnline();
  const [asking, setAsking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, startRemoving] = useTransition();
  const many = keys.length > 1;

  function remove(key: PasskeyItem) {
    setNotice(null);
    setProblem(null);
    startRemoving(async () => {
      let removed;
      try {
        removed = await forgetPasskey(key.id);
      } catch {
        removed = { ok: false as const, error: FAILED };
      }
      setAsking(null);
      if (!removed.ok) {
        setProblem(removed.error);
        return;
      }
      setNotice(`Removed the passkey on ${key.label}. That device can't sign in with it now.`);
      router.refresh();
    });
  }

  return (
    <>
      <div className={styles.status} role="status">
        {notice && <Pill tone="good">{notice}</Pill>}
      </div>
      {problem && (
        <p role="alert" className={cx("small", styles.problem)}>
          {problem}
        </p>
      )}
      {keys.length === 0 && <p className="muted small">No passkeys yet.</p>}
      <ul className={styles.keys} aria-label="Passkeys" hidden={keys.length === 0}>
        {keys.map((key) =>
          asking === key.id ? (
            <li key={key.id} className={styles.confirm}>
              <p className="small">
                Remove the passkey on {key.label}? That device won&apos;t be able to sign in with
                it. Its own copy stays in its password settings until you delete it there.
              </p>
              <div className={styles.confirmActions}>
                <Button variant="ghost" onClick={() => setAsking(null)}>
                  Keep it
                </Button>
                <Button
                  disabled={!online || busy}
                  onClick={() => remove(key)}
                  className={styles.danger}
                >
                  {busy ? "Removing…" : "Remove"}
                </Button>
              </div>
            </li>
          ) : (
            <ListRow
              key={key.id}
              as="li"
              leading={<Tile icon="passkey" />}
              title={key.label}
              detail={key.detail}
              trailing={
                many && (
                  <Button
                    variant="ghost"
                    disabled={!online || busy}
                    onClick={() => {
                      setProblem(null);
                      setAsking(key.id);
                    }}
                    aria-label={`Remove the passkey on ${key.label}`}
                  >
                    Remove
                  </Button>
                )
              }
            />
          ),
        )}
      </ul>
      {keys.length === 1 && (
        <p className="muted small">
          This is your only passkey, so it can&apos;t be removed. Add one on another device first.
        </p>
      )}
      <div className={styles.keyActions}>
        <AddPasskeyButton
          onAdded={() => {
            setProblem(null);
            setNotice("Passkey added. This device can sign in with it now.");
            router.refresh();
          }}
        />
        <SignOutButton />
      </div>
    </>
  );
}
