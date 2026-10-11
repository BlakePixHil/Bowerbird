"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useState, useTransition } from "react";
import { forgetThisDevice } from "@/components/offline/forget";
import { useOnline } from "@/components/offline/online";
import { Button, type ButtonLook } from "@/components/ui";
import { finishAddPasskey, signOut, startAddPasskey } from "@/lib/auth/actions";
import styles from "./Auth.module.css";
import { passkeyProblem } from "./errors";

/**
 * Add a passkey on this device, so a laptop or a second phone can sign in too. With onAdded, that
 * runs instead of showing "Passkey added".
 */
export function AddPasskeyButton({
  onAdded,
  className,
  ...look
}: Omit<ButtonLook, "icon"> & { onAdded?: () => void; className?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setMessage(null);
    startTransition(async () => {
      const { options } = await startAddPasskey();
      let response;
      try {
        response = await startRegistration({ optionsJSON: options });
      } catch (error) {
        setMessage(passkeyProblem(error, true));
        return;
      }
      const result = await finishAddPasskey(response);
      if ("error" in result) setMessage(result.error);
      else if (onAdded) onAdded();
      else setMessage("Passkey added. This device can sign in with it now.");
    });
  }

  return (
    <div className={styles.stack}>
      <Button icon="passkey" onClick={add} disabled={pending} className={className} {...look}>
        {pending ? "Making a passkey…" : "Add a passkey on this device"}
      </Button>
      <p role="status" className={styles.note}>
        {message}
      </p>
    </div>
  );
}

/**
 * Sign out on this device. Works without JavaScript too. It forgets the pages and changes this
 * device kept for reading offline as it goes, and the sign-in page makes sure. With no signal it
 * waits, since the server has to end the session.
 */
export function SignOutButton() {
  const online = useOnline();
  return (
    <form action={signOut} onSubmit={() => void forgetThisDevice()}>
      <Button type="submit" variant="ghost" disabled={!online}>
        Sign out
      </Button>
      {!online && <p className={styles.note}>Signing out needs a connection.</p>}
    </form>
  );
}
