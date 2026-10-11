import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSetup, SetupFrame, WelcomeForm } from "@/components/setup";
import { APP_NAME } from "@/config/app";

export const metadata: Metadata = { title: "Welcome" };

/** First run, step 1: your name and what to call the household. */
export default async function WelcomePage() {
  const { shell, me, so, at } = await getSetup();
  if (!at) redirect("/");
  return (
    <SetupFrame
      at="welcome"
      today={shell.today}
      so={so}
      initials={shell.member.initials}
      back={null}
      mark
      title={`Welcome to ${APP_NAME}`}
      intro="Your passkey is set. Two quick questions, then we'll bring in your transactions."
    >
      <WelcomeForm name={so.name} household={so.household} owner={me.member.role === "owner"} />
    </SetupFrame>
  );
}
