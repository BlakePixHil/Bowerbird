"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonLink, Icon, LogoMark } from "@/components/ui";
import { finishEmailSignIn } from "@/lib/auth/actions";
import { EMAIL_LINK_MINUTES } from "@/lib/auth/limits";
import { AddPasskeyButton } from "./AccountActions";
import styles from "./EmailLinkLanding.module.css";

type State = "checking" | "signed-in" | "failed";

/** Reads the link's token from after the # and takes it out of the address bar straight away. */
function takeToken(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("t");
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return token;
}

/**
 * Where the emailed link lands. It signs in from the browser rather than on page load, so mail
 * scanners that open links to check them can't use the link up.
 */
export function EmailLinkLanding({ next }: { next: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("checking");
  const started = useRef(false);

  useEffect(() => {
    function signIn() {
      const token = takeToken();
      (token ? finishEmailSignIn(token) : Promise.resolve({ error: "no link" })).then(
        (result) => setState("error" in result ? "failed" : "signed-in"),
        () => setState("failed"),
      );
    }
    // Opening a newer link in the same tab only changes the part after the #.
    function newLink() {
      if (!window.location.hash) return;
      setState("checking");
      signIn();
    }
    if (!started.current) {
      started.current = true;
      signIn();
    }
    window.addEventListener("hashchange", newLink);
    return () => window.removeEventListener("hashchange", newLink);
  }, []);

  const carryOn = () => router.replace(next);

  if (state === "checking") {
    return (
      <section aria-labelledby="landing-title" aria-busy="true" className={styles.card}>
        <LogoMark size={52} className={styles.mark} />
        <h1 id="landing-title" className={styles.title}>
          Signing you in…
        </h1>
      </section>
    );
  }

  if (state === "failed") {
    return (
      <section aria-labelledby="landing-title" className={styles.card}>
        <span className={styles.tile} data-tone="warn" aria-hidden="true">
          <Icon name="alert" size="lg" />
        </span>
        <div>
          <h1 id="landing-title" className={styles.title}>
            This link doesn&apos;t work any more
          </h1>
          <p className={styles.text}>
            Sign-in links last {EMAIL_LINK_MINUTES} minutes and work once, and only the newest one
            works. Send yourself a new one, or use your passkey.
          </p>
        </div>
        <ButtonLink href="/sign-in" variant="primary" size="lg" block className={styles.tall}>
          Back to sign in
        </ButtonLink>
      </section>
    );
  }

  return (
    <section aria-labelledby="landing-title" className={styles.card}>
      <span className={styles.tile} aria-hidden="true">
        <Icon name="check" size="lg" />
      </span>
      <div>
        <h1 id="landing-title" className={styles.title}>
          You&apos;re signed in
        </h1>
        <p className={styles.text}>
          Add a passkey on this device and next time you can sign in with Face ID, a fingerprint or
          a screen lock, without waiting for an email.
        </p>
      </div>
      <div className={styles.actions}>
        <AddPasskeyButton
          variant="primary"
          size="lg"
          block
          className={styles.tall}
          onAdded={carryOn}
        />
        <ButtonLink href={next} replace variant="ghost" size="lg" block className={styles.tall}>
          Not now
        </ButtonLink>
      </div>
    </section>
  );
}
