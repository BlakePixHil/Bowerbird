import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSetup, RoutePicker, SetupFrame } from "@/components/setup";
import { APP_NAME } from "@/config/app";
import { canEncrypt } from "@/lib/crypto";
import { FIRST_RUN_PATHS } from "@/lib/first-run";

export const metadata: Metadata = { title: "Bring in your transactions" };

/** First run, step 2: live sync or bank files, then off to that flow, which comes back here. */
export default async function BringInPage() {
  const { shell, so, at } = await getSetup();
  if (!at) redirect("/");
  if (at === "welcome") redirect(FIRST_RUN_PATHS.welcome);
  return (
    <SetupFrame
      at="bring"
      today={shell.today}
      so={so}
      initials={shell.member.initials}
      back={FIRST_RUN_PATHS.welcome}
      title="How should your transactions get in?"
      intro={`Pick one to start. Either way ${APP_NAME} only reads. It never moves money and never sees a bank password.`}
    >
      <RoutePicker liveReady={canEncrypt()} back={FIRST_RUN_PATHS.welcome} />
    </SetupFrame>
  );
}
