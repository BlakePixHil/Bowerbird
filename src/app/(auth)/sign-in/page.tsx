import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { RunningTotalChart } from "@/components/charts";
import { DemoSignIn } from "@/components/auth/DemoSignIn";
import { SignInFlow } from "@/components/auth/SignInFlow";
import { ForgetThisDevice } from "@/components/offline/ForgetThisDevice";
import { Card, Icon, Logo, LogoMark, Well, Wordmark } from "@/components/ui";
import { APP_NAME } from "@/config/app";
import { currentMember, safeNext } from "@/lib/auth";
import { passkeyButtonLabel, passkeyInsteadLabel } from "@/lib/auth/device";
import { hasUsers } from "@/lib/auth/setup";
import { getDb } from "@/lib/db";
import styles from "./page.module.css";
import { preview } from "./preview";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const raw = (await searchParams).next;
  const next = safeNext(Array.isArray(raw) ? raw[0] : raw);
  if (!(await hasUsers(getDb()))) redirect("/setup");
  if (await currentMember()) redirect(next);
  const userAgent = (await headers()).get("user-agent");
  const promise = `No passwords. ${APP_NAME} only reads your bank data and never moves money.`;

  return (
    <div className={styles.layout}>
      <section aria-label={`Sign in to ${APP_NAME}`} className={styles.card}>
        <SignInFlow
          phoneLabel={passkeyButtonLabel(userAgent)}
          insteadLabel={passkeyInsteadLabel(userAgent)}
          next={next}
          actionsClassName={styles.actions}
          intro={
            <>
              <div className={styles.phoneIntro}>
                <LogoMark size={76} className={styles.bigMark} />
                <Wordmark as="h1" fontSize={34} className={styles.appName} />
                <p className={styles.tagline}>All your money in one place.</p>
              </div>
              <div className={styles.desktopIntro}>
                <p className="mono muted">WELCOME BACK</p>
                <h1 className="h1">Sign in to {APP_NAME}</h1>
                <p className="sub">
                  Use the passkey on this computer or your phone. Face ID, Touch ID and Windows
                  Hello all work.
                </p>
              </div>
            </>
          }
          extra={process.env.NODE_ENV === "development" && <DemoSignIn />}
          promise={
            <p className={styles.promise}>
              <Icon name="lock" size="sm" />
              <span>{promise}</span>
            </p>
          }
        />
      </section>

      <section aria-label={`About ${APP_NAME}`} className={styles.about}>
        <Logo fontSize={20} />
        <div>
          <p className={styles.bigLine}>All your money in one place.</p>
          <p className={styles.aboutText}>
            Read-only. It sees your balances and spending, and it can never move money.
          </p>
        </div>
        <Card className={styles.preview}>
          <div className={styles.previewHead}>
            <span className="h2">October so far</span>
            <span className="mono muted">SAT 10 OCT</span>
          </div>
          <div className={styles.chips} aria-hidden="true">
            {preview.chips.map((chip) => (
              <Well key={chip.label} className={styles.chip}>
                <span className="tiny sub">{chip.label}</span>
                <span className={styles.chipValue}>{chip.value}</span>
              </Well>
            ))}
          </div>
          <RunningTotalChart {...preview.chart} />
        </Card>
      </section>
      <ForgetThisDevice />
    </div>
  );
}
