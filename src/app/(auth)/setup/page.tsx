import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SetupForm } from "@/components/auth/SetupForm";
import { Icon, LogoMark } from "@/components/ui";
import { APP_NAME } from "@/config/app";
import { hasUsers } from "@/lib/auth/setup";
import { getDb } from "@/lib/db";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Set up" };

/** The very first visit: make the owner and their passkey. Closed once anyone has set up. */
export default async function SetupPage() {
  // Whether anyone has set up is only known at request time, so this page is never prerendered.
  await connection();
  if (await hasUsers(getDb())) redirect("/sign-in");
  return (
    <section aria-labelledby="setup-title" className={styles.card}>
      <LogoMark size={52} className={styles.mark} />
      <div>
        <h1 id="setup-title" className={styles.title}>
          Set up {APP_NAME}
        </h1>
        <p className={styles.intro}>
          First, make the passkey you&apos;ll sign in with. It uses Face ID, your fingerprint or
          your screen lock, so there&apos;s no password to remember.
        </p>
      </div>
      <SetupForm />
      <p className={styles.promise}>
        <Icon name="lock" size="sm" />
        <span>{APP_NAME} only reads your bank data and never moves money.</span>
      </p>
    </section>
  );
}
