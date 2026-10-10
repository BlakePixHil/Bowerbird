"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Button, Icon, IconButton, LogoMark, TextField, Well } from "@/components/ui";
import { APP_NAME } from "@/config/app";
import { sendSignInLink } from "@/lib/auth/actions";
import { EMAIL_LINK_MINUTES } from "@/lib/auth/limits";
import auth from "./Auth.module.css";
import { PasskeySignIn } from "./PasskeySignIn";
import styles from "./SignInFlow.module.css";

type Mode = "start" | "email" | "sent";

/**
 * The sign-in card's moving parts from the "Sign in" and "Desktop: Sign in" boards: the passkey
 * button, the "Email me a sign-in link" sheet, and "Check your email" once a link is on its way.
 */
export function SignInFlow({
  intro,
  promise,
  extra,
  phoneLabel,
  insteadLabel,
  next,
  actionsClassName,
}: {
  /** The logo on a phone and "Sign in to Bowerbird" on a desktop. */
  intro: ReactNode;
  /** "No passwords…" under the buttons. */
  promise: ReactNode;
  /** Anything else under the buttons, such as the developer sign-in. */
  extra?: ReactNode;
  phoneLabel: string;
  insteadLabel: string;
  next?: string;
  actionsClassName?: string;
}) {
  const [mode, setMode] = useState<Mode>("start");
  const [email, setEmail] = useState("");
  const [resent, setResent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send(address: string, again: boolean) {
    setProblem(null);
    startTransition(async () => {
      const result = await sendSignInLink({ email: address, next });
      if ("error" in result) {
        setProblem(result.error);
        return;
      }
      setEmail(result.sentTo);
      setMode("sent");
      setResent(again);
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send(String(new FormData(event.currentTarget).get("email") ?? ""), false);
  }

  function backToPasskey() {
    setMode("start");
    setResent(false);
  }

  if (mode === "sent") {
    return (
      <>
        <CheckEmail
          email={email}
          resent={resent}
          pending={pending}
          insteadLabel={insteadLabel}
          onResend={() => send(email, true)}
          onBack={backToPasskey}
        />
        <div className={styles.desktopFooter}>{promise}</div>
      </>
    );
  }

  return (
    <>
      {intro}
      <div className={actionsClassName}>
        <PasskeySignIn phoneLabel={phoneLabel} next={next} primary={mode === "start"} />
        {mode === "start" ? (
          <Button
            size="lg"
            block
            icon="mail"
            aria-expanded="false"
            className={auth.tall}
            onClick={() => setMode("email")}
          >
            Email me a sign-in link
          </Button>
        ) : (
          <Well as="section" aria-labelledby="email-sheet-title" className={styles.sheet}>
            <div className={styles.sheetHead}>
              <h2 id="email-sheet-title" className={styles.sheetTitle}>
                Email me a sign-in link
              </h2>
              <IconButton
                icon="close"
                label="Close email sign-in"
                className={styles.close}
                onClick={backToPasskey}
              />
            </div>
            <form onSubmit={submit} className={styles.sheetForm}>
              <TextField
                label="Your email"
                name="email"
                type="email"
                icon="mail"
                autoComplete="email"
                inputMode="email"
                spellCheck={false}
                required
                autoFocus
                defaultValue={email}
                error={problem}
              />
              <Button type="submit" variant="primary" size="lg" block disabled={pending}>
                <span>{pending ? "Sending…" : "Send the link"}</span>
                {!pending && <Icon name="arrow-right" size="sm" />}
              </Button>
              <span className={styles.lasts}>
                It lasts {EMAIL_LINK_MINUTES} minutes and works once.
              </span>
            </form>
          </Well>
        )}
        {extra}
        {promise}
      </div>
    </>
  );
}

const HINT_FIRST = "Nothing yet? Check your junk folder, or send it again.";
const HINT_AGAIN = "Use the newest email. Older links stop working.";

/** The "Sign in: check your email" board, and the desktop board's "sent" state. */
function CheckEmail({
  email,
  resent,
  pending,
  insteadLabel,
  onResend,
  onBack,
}: {
  email: string;
  resent: boolean;
  pending: boolean;
  insteadLabel: string;
  onResend: () => void;
  onBack: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  // Focus moves to the heading so screen readers hear that the screen changed.
  useEffect(() => title.current?.focus(), []);
  const hint = resent ? HINT_AGAIN : HINT_FIRST;
  const lasts = `The link lasts ${EMAIL_LINK_MINUTES} minutes and works once.`;
  return (
    <div className={styles.sent}>
      <IconButton
        icon="arrow-back"
        label="Back to sign in"
        className={styles.back}
        onClick={onBack}
      />
      <div className={styles.sentHead}>
        <span className={styles.mailTile} aria-hidden="true">
          <Icon name="mail" size="lg" />
        </span>
        <div>
          <h1 className={styles.sentTitle} tabIndex={-1} ref={title}>
            Check your email
          </h1>
          <p className={styles.sentText}>
            We sent a sign-in link to <span className={styles.address}>{email}</span>.
            <span className={styles.desktopOnly}>
              {" "}
              Open it on this computer and you&apos;re in.
            </span>
          </p>
        </div>
      </div>

      <ol className={styles.steps}>
        <li>
          <span className={styles.stepNumber}>1</span>
          <span>Open the email from {APP_NAME} on this phone.</span>
        </li>
        <li>
          <span className={styles.stepNumber}>2</span>
          <span>Tap Sign in to {APP_NAME}.</span>
        </li>
        <li>
          <span className={styles.stepNumber}>3</span>
          <span>You come straight back to {APP_NAME}, signed in.</span>
        </li>
      </ol>

      <div className={styles.preview} aria-hidden="true">
        <div className={styles.previewHead}>
          <LogoMark size={30} />
          <div className="grow">
            <div className={styles.previewFrom}>{APP_NAME}</div>
            <div className="tiny muted ellipsis">Your sign-in link</div>
          </div>
          <span className="tiny muted">now</span>
        </div>
        <Well className={styles.previewBody}>
          <span className="small sub">Tap below to sign in on this phone.</span>
          <span className={styles.previewButton}>Sign in to {APP_NAME}</span>
        </Well>
      </div>
      <p className={styles.phoneNote}>
        <Icon name="clock" size="sm" />
        <span>{lasts} Nobody else can use it after you do.</span>
      </p>

      <ul className={styles.notes}>
        <li>
          <Icon name="clock" size="sm" />
          <span>{lasts}</span>
        </li>
        <li>
          <Icon name="info" size="sm" />
          <span>{hint}</span>
        </li>
      </ul>

      <div className={styles.sentActions}>
        <p className={styles.phoneHint}>{hint}</p>
        {resent ? (
          <div role="status" className={styles.sentAgain}>
            <Icon name="check" size="sm" />
            <span>Sent again</span>
          </div>
        ) : (
          <Button size="lg" icon="refresh" disabled={pending} onClick={onResend}>
            {pending ? "Sending…" : "Resend the link"}
          </Button>
        )}
        <Button
          variant="ghost"
          size="lg"
          icon="face-id"
          onClick={onBack}
          className={styles.instead}
        >
          <span className={styles.phoneOnly}>{insteadLabel}</span>
          <span className={styles.desktopOnly}>Use a passkey instead</span>
        </Button>
      </div>
    </div>
  );
}
