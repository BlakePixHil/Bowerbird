import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, cx, Icon, IconButtonLink, LogoMark, Pill } from "@/components/ui";
import { APP_NAME } from "@/config/app";
import type { FirstRunStep } from "@/lib/first-run/rules";
import type { PlainDate } from "@/lib/money";
import { RAIL, railSteps, stepLine, type SetupSoFar } from "./steps";
import styles from "./Setup.module.css";

/**
 * The frame around first-run steps 1 to 3, from the boards "First run 1" to "First run 3" and
 * "Desktop: First run". A phone gets back, "Step N of 4" and a progress line; a computer gets the
 * app's name, the read-only promise and the step rail beside the page.
 */
export function SetupFrame({
  at,
  today,
  so,
  initials,
  back,
  before,
  mark = false,
  title,
  intro,
  children,
}: {
  at: FirstRunStep;
  today: PlainDate;
  so: SetupSoFar;
  initials: string;
  /** The step before, for the phone's back button. */
  back: string | null;
  /** Above the title, like step 3's "Your transactions are in". */
  before?: ReactNode;
  /** The app's mark over the title on a phone, as Welcome has. */
  mark?: boolean;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  const steps = railSteps(at, so);
  const now = steps.findIndex((step) => step.state === "now") + 1;
  const of = `Step ${now} of ${RAIL.length}`;
  return (
    <div className={styles.frame}>
      <header className={styles.top}>
        <span className={styles.brand}>
          <LogoMark size={28} />
          <span className={styles.brandName}>{APP_NAME}</span>
        </span>
        <span className={styles.topRight}>
          <Pill tone="quiet" icon="eye">
            Read-only, never moves money
          </Pill>
          <span className={styles.me}>
            <Avatar owner="you" initials={initials} label={so.name} />
            <span className="small">{so.name}</span>
          </span>
        </span>
      </header>

      <div className={styles.phoneBar}>
        {back ? (
          <IconButtonLink icon="arrow-left" label="Back" href={back} />
        ) : (
          <span className={styles.spacer} aria-hidden="true" />
        )}
        <span className={cx("small sub tnum", styles.of)}>{of}</span>
        <span className={styles.spacer} aria-hidden="true" />
      </div>
      <div
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={1}
        aria-valuemax={RAIL.length}
        aria-valuenow={now}
        aria-valuetext={`${of}, ${RAIL[now - 1].title.toLowerCase()}`}
        className={styles.progress}
      >
        {RAIL.map((step, i) => (
          <span key={step.key} className={cx(i < now && styles.on)} />
        ))}
      </div>

      <div className={styles.layout}>
        <nav aria-label="Setup steps" className={styles.rail}>
          <div className={styles.railHead}>
            <span className="mono">SET UP</span>
            <span className="mono tnum">{of.toUpperCase()}</span>
          </div>
          <div className={styles.railBars} aria-hidden="true">
            {RAIL.map((step, i) => (
              <span key={step.key} className={cx(i < now && styles.on)} />
            ))}
          </div>
          <ol className={styles.railSteps}>
            {steps.map((step) => {
              const body = (
                <>
                  <span className={cx(styles.num, styles[step.state])}>
                    {step.state === "done" ? <Icon name="check" size="sm" /> : step.n}
                  </span>
                  <span className="grow">
                    <span className={styles.railTitle}>{step.title}</span>
                    <span className={cx("tiny", styles.railSub)}>{step.sub}</span>
                  </span>
                </>
              );
              return (
                <li key={step.key}>
                  {step.href && step.state === "done" ? (
                    <Link href={step.href} className={styles.railStep}>
                      {body}
                    </Link>
                  ) : (
                    <span
                      className={cx(styles.railStep, step.state === "now" && styles.railNow)}
                      aria-current={step.state === "now" ? "step" : undefined}
                    >
                      {body}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <div className={styles.main}>
          {before}
          <div className={styles.heading}>
            {mark && <LogoMark size={52} className={styles.mark} />}
            <p className={cx("mono", styles.stepLine)}>{stepLine(today, now)}</p>
            <h1 className={cx("h1", styles.title)}>{title}</h1>
            <p className={cx("sub", styles.intro)}>{intro}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
