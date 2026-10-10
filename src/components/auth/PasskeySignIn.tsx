"use client";

import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { finishSignIn, startSignIn } from "@/lib/auth/actions";
import styles from "./Auth.module.css";
import { passkeyProblem } from "./errors";

/** The passkey button, and what went wrong if it didn't work. */
export function PasskeySignIn({
  phoneLabel,
  next,
  primary = true,
}: {
  /** "Sign in with Face ID" and so on. Desktop always says "Sign in with a passkey". */
  phoneLabel: string;
  next?: string;
  primary?: boolean;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function signIn() {
    setProblem(null);
    startTransition(async () => {
      if (!browserSupportsWebAuthn()) {
        setProblem("This browser can't use passkeys. Try another browser or device.");
        return;
      }
      const { options } = await startSignIn();
      let response;
      try {
        response = await startAuthentication({ optionsJSON: options });
      } catch (error) {
        setProblem(passkeyProblem(error, false));
        return;
      }
      const result = await finishSignIn(response, next);
      if (result?.error) setProblem(result.error);
    });
  }

  return (
    <div className={styles.stack}>
      <Button
        variant={primary ? "primary" : "default"}
        size="lg"
        block
        icon="face-id"
        onClick={signIn}
        disabled={pending}
        className={styles.tall}
      >
        <span className={styles.phoneOnly}>{pending ? "Checking…" : phoneLabel}</span>
        <span className={styles.desktopOnly}>
          {pending ? "Checking…" : "Sign in with a passkey"}
        </span>
      </Button>
      <p role="alert" className={styles.problem}>
        {problem}
      </p>
    </div>
  );
}
