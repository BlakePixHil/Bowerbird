"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { finishAddPasskey, signOut, startAddPasskey } from "@/lib/auth/actions";
import styles from "./Auth.module.css";
import { passkeyProblem } from "./errors";

/** Add a passkey on this device, so a laptop or a second phone can sign in too. */
export function AddPasskeyButton() {
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
      setMessage(
        "error" in result ? result.error : "Passkey added. This device can sign in with it now.",
      );
    });
  }

  return (
    <div className={styles.stack}>
      <Button icon="passkey" onClick={add} disabled={pending}>
        {pending ? "Making a passkey…" : "Add a passkey on this device"}
      </Button>
      <p role="status" className={styles.note}>
        {message}
      </p>
    </div>
  );
}

/** Sign out on this device. Works without JavaScript too. */
export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost">
        Sign out
      </Button>
    </form>
  );
}
