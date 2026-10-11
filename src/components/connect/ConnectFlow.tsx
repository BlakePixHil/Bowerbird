"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import {
  Button,
  ButtonLink,
  cx,
  Divider,
  Icon,
  Tag,
  TextLink,
  Tile,
  Well,
  WarningBanner,
} from "@/components/ui";
import { APP_NAME, LIVE_SYNC_PROVIDER } from "@/config/app";
import { checkSetupToken } from "@/lib/banks/simplefin/token";
import { connectLiveSync } from "./actions";
import { awayFrom } from "./away";
import styles from "./Connect.module.css";
import {
  AT_EACH_BANK,
  ConsentNote,
  KeepsNote,
  NumberedList,
  OpenProvider,
  PhoneTop,
  Section,
  StepRail,
  TokenField,
  TokenStatus,
  WHAT_IT_KEEPS,
  type StepKey,
} from "./parts";

const P = LIVE_SYNC_PROVIDER;

const NOT_READY_TITLE = "Live sync isn't ready on this server yet.";
const NOT_READY_BODY =
  "It needs its encryption key set before it can keep a bank link. Importing files still works.";
const CANT_PASTE =
  "The app can't read what you copied. Press and hold in the box, then choose Paste.";

/**
 * Connect live sync, steps 1 and 2: connect banks in Redbark, then paste the setup token. One flow
 * drawn twice, for the phone and desktop boards; CSS shows one. The token lives only in this
 * component's state until it's sent, and is cleared once it's used. With `reconnect`, the token
 * gives that connection a new access link instead of making a new connection.
 */
export function ConnectFlow({
  ready,
  reconnect,
  inSetup = false,
}: {
  ready: boolean;
  reconnect?: string;
  /** Part of the first run, so back goes to setup. */
  inSetup?: boolean;
}) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [shown, setShown] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<StepKey>("banks");
  const [busy, startTransition] = useTransition();
  const phoneInput = useRef<HTMLInputElement>(null);
  const desktopInput = useRef<HTMLInputElement>(null);
  const ids = { phone: useId(), desktop: useId(), phoneStatus: useId(), desktopStatus: useId() };

  const check = token.trim() ? checkSetupToken(token) : null;
  const valid = check?.ok === true;
  const last4 = check?.ok ? check.last4 : null;
  const problem = error ?? note ?? (shown && check && !check.ok ? check.error : null);
  // After a failed claim the same token won't work, so Continue waits for a new one.
  const canContinue = ready && valid && !busy && !error;

  function change(text: string) {
    setToken(text);
    setError(null);
    setNote(null);
    // A whole token arrives in one go when it's pasted, so check it straight away.
    if (text.length - token.length > 8) setShown(true);
  }

  async function paste(input: HTMLInputElement | null) {
    try {
      const text = await navigator.clipboard.readText();
      setToken(text);
      setShown(true);
      setError(null);
      setNote(null);
    } catch {
      setNote(CANT_PASTE);
      input?.focus();
    }
  }

  function clear(input: () => HTMLInputElement | null) {
    setToken("");
    setShown(false);
    setError(null);
    setNote(null);
    requestAnimationFrame(() => input()?.focus());
  }

  function connect() {
    if (!canContinue) return;
    const form = new FormData();
    form.set("token", token);
    if (reconnect) form.set("reconnect", reconnect);
    startTransition(async () => {
      const answer = await connectLiveSync(form);
      if (answer.ok) {
        setToken("");
        router.push(answer.next);
      } else {
        setError(answer.error);
      }
    });
  }

  const notReady = !ready && (
    <WarningBanner title={NOT_READY_TITLE} className={styles.banner}>
      {NOT_READY_BODY}
    </WarningBanner>
  );

  const continueLabel = busy ? "Connecting…" : "Continue";

  // Phone -------------------------------------------------------------------

  const phoneSteps = [
    {
      title: `In ${P.name}, connect your banks`,
      body: (
        <>
          <p className={cx("sub small", styles.stepText)}>
            Each bank shows its own Consumer Data Right consent screen. You approve read-only access
            there, at your bank.
          </p>
          <OpenProvider className={styles.stepButton} />
        </>
      ),
    },
    {
      title: `Copy the setup token ${P.name} gives you`,
      body: (
        <p className={cx("sub small", styles.stepText)}>
          It’s one long line of letters and numbers. It works once, so it’s no use to anyone after
          you paste it here.
        </p>
      ),
    },
  ];

  const phone = (
    <div className={styles.phone}>
      <PhoneTop step={1} back={awayFrom(inSetup)} />
      <div className={styles.intro}>
        <h1 className="h1">{reconnect ? "Reconnect live sync" : "Connect live sync"}</h1>
        <p className={cx("sub", styles.lead)}>
          {reconnect
            ? `Make a new setup token in ${P.name} and paste it here. Everything already here stays.`
            : "Your bank transactions come in by themselves, every day."}
        </p>
        <div className={styles.tags}>
          <Tag>Optional</Tag>
          <Tag>
            {P.price}, paid to {P.name}
          </Tag>
          <Tag>Read-only</Tag>
        </div>
      </div>
      {notReady}
      <ol className={styles.steps} aria-label="Three steps">
        {phoneSteps.map((item, i) => (
          <li key={item.title} className={styles.step}>
            <span className={styles.stepRail}>
              <StepNumber n={i + 1} done={valid} />
              <span className={styles.stepLine} />
            </span>
            <div className={styles.stepBody}>
              <div className={styles.stepTitle}>{item.title}</div>
              {item.body}
            </div>
          </li>
        ))}
        <li className={styles.step}>
          <span className={styles.stepRail}>
            <StepNumber n={3} done={valid} />
          </span>
          <div className={cx(styles.stepBody, styles.stepLast)}>
            <label htmlFor={ids.phone} className={styles.stepTitle}>
              Paste it here
            </label>
            <TokenField
              id={ids.phone}
              value={token}
              last4={last4}
              placeholder="Setup token"
              onChange={change}
              onPaste={() => paste(phoneInput.current)}
              onClear={() => clear(() => phoneInput.current)}
              onBlur={() => setShown(true)}
              inputRef={phoneInput}
              describedBy={ids.phoneStatus}
              invalid={Boolean(problem) && !valid}
              className={styles.phoneField}
            />
            <TokenStatus
              id={ids.phoneStatus}
              ok={valid && !error}
              okNote={
                check?.ok ? `A ${check.provider === P.name ? P.name : "SimpleFIN"} setup token` : ""
              }
              problem={problem}
            />
          </div>
        </li>
      </ol>
      <KeepsNote />
      <div className={styles.phoneActions}>
        <Button variant="primary" size="lg" block disabled={!canContinue} onClick={connect}>
          {continueLabel}
        </Button>
        <ButtonLink href="/import" variant="ghost" size="lg" block>
          Upload a file instead, it’s free
        </ButtonLink>
      </div>
    </div>
  );

  // Desktop -----------------------------------------------------------------

  const banksCard = (
    <Section title={`Connect your banks in ${P.name}`}>
      <p className={cx("sub", styles.sectionText)}>
        {P.name} does the bank connection. Each bank shows its own Consumer Data Right consent
        screen, and you approve read-only access there, at your bank. {APP_NAME} never sees your
        bank sign-in.
      </p>
      <Well className={styles.how}>
        <h3 className="h3">What happens at each bank</h3>
        <NumberedList items={AT_EACH_BANK} className={styles.howList} />
      </Well>
      <div className={styles.cardActions}>
        <OpenProvider />
        <Button
          variant="primary"
          onClick={() => {
            setStep("token");
            requestAnimationFrame(() => desktopInput.current?.focus());
          }}
        >
          Next: paste setup token
        </Button>
      </div>
    </Section>
  );

  const tokenCard = (
    <Section title="Paste the setup token">
      <p className={cx("sub", styles.sectionText)}>
        {P.name} gives you a setup token once your banks are connected. Copy it there, then paste it
        here. It works once, so it’s no use to anyone after that.
      </p>
      <label htmlFor={ids.desktop} className={cx("small", styles.tokenLabel)}>
        Setup token
      </label>
      <TokenField
        id={ids.desktop}
        value={token}
        last4={last4}
        placeholder={`Paste the setup token from ${P.name}`}
        onChange={change}
        onPaste={() => paste(desktopInput.current)}
        onClear={() => clear(() => desktopInput.current)}
        onBlur={() => setShown(true)}
        inputRef={desktopInput}
        describedBy={ids.desktopStatus}
        invalid={Boolean(problem) && !valid}
        className={styles.desktopField}
      />
      <TokenStatus
        id={ids.desktopStatus}
        ok={valid && !error}
        okNote="When you continue, it’s swapped for an encrypted access link."
        problem={problem}
      />
      <div className={cx(styles.cardActions, styles.tokenActions)}>
        <Button onClick={() => setStep("banks")}>Back</Button>
        <Button variant="primary" disabled={!canContinue} onClick={connect}>
          {continueLabel}
        </Button>
      </div>
    </Section>
  );

  const planCard = (
    <Section title={`${P.name} ${P.plan}`} side lead={<Tile size="sm">{P.name.charAt(0)}</Tile>}>
      <div className={cx("mid tnum", styles.price)}>
        {P.price.replace(" a month", "")}{" "}
        <span className={cx("sub", styles.per)}>a month, paid to {P.name}</span>
      </div>
      <p className={cx("small sub", styles.sideText)}>Up to {P.connections} bank connections.</p>
      <Divider className={styles.sideDivider} />
      <p className="small sub">Live sync is optional. Importing files is free and always works.</p>
      <TextLink href="/import" className={styles.sideLink}>
        Upload a file instead
      </TextLink>
    </Section>
  );

  const keepsCard = (
    <Section title={`What ${APP_NAME} keeps`} side lead={<Icon name="shield" size="sm" />}>
      <ul className={styles.keepsList}>
        {WHAT_IT_KEEPS.map((item) => (
          <li key={item.text}>
            <Icon name={item.icon} size="sm" />
            <span className="small sub">{item.text}</span>
          </li>
        ))}
      </ul>
    </Section>
  );

  const desktop = (
    <div className={styles.desktop}>
      {notReady}
      <StepRail at={step} tokenIn={valid} onPick={setStep} steps={reconnect ? 2 : undefined} />
      <div className={styles.layout}>
        <div className={styles.main}>{step === "banks" ? banksCard : tokenCard}</div>
        <aside className={styles.aside} aria-label="About this step">
          {step === "banks" ? planCard : keepsCard}
          <ConsentNote />
        </aside>
      </div>
    </div>
  );

  return (
    <>
      {phone}
      {desktop}
    </>
  );
}

function StepNumber({ n, done }: { n: number; done: boolean }) {
  return (
    <span className={cx(styles.stepNum, done && styles.stepNumDone)}>
      {done ? <Icon name="check" size="sm" /> : n}
    </span>
  );
}
