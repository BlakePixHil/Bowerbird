"use client";

import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { useState, useTransition, type FormEvent } from "react";
import { Button, TextField } from "@/components/ui";
import { finishSetup, startSetup } from "@/lib/auth/actions";
import styles from "./Auth.module.css";
import { passkeyProblem } from "./errors";

/** Your name and email, then the passkey you'll sign in with. */
export function SetupForm() {
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setProblem(null);
    startTransition(async () => {
      if (!browserSupportsWebAuthn()) {
        setProblem("This browser can't make passkeys. Try another browser or device.");
        return;
      }
      const started = await startSetup({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
      });
      if ("error" in started) {
        setProblem(started.error);
        return;
      }
      let response;
      try {
        response = await startRegistration({ optionsJSON: started.options });
      } catch (error) {
        setProblem(passkeyProblem(error, true));
        return;
      }
      const result = await finishSetup(response);
      if (result?.error) setProblem(result.error);
    });
  }

  return (
    <form onSubmit={submit} className={styles.form}>
      <TextField
        label="Your name"
        name="name"
        icon="user"
        autoComplete="given-name"
        required
        maxLength={60}
      />
      <TextField
        label="Your email"
        name="email"
        type="email"
        icon="mail"
        autoComplete="email"
        inputMode="email"
        spellCheck={false}
        required
        hint="Only for emailing you a sign-in link when your passkey isn't handy."
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        icon="passkey"
        disabled={pending}
        className={styles.tall}
      >
        {pending ? "Making your passkey…" : "Create your passkey"}
      </Button>
      <p role="alert" className={styles.problem}>
        {problem}
      </p>
    </form>
  );
}
