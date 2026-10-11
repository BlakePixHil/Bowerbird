import type { Metadata } from "next";
import { headers } from "next/headers";
import { browserOf, deviceOf, InstallGuide, kindOf } from "@/components/install";
import { PageHeader } from "@/components/shell";
import { ButtonLink, Pill } from "@/components/ui";
import { APP_NAME, APP_SHORT_NAME } from "@/config/app";
import { requireMember } from "@/lib/auth";

export const metadata: Metadata = { title: "Install the app" };

/**
 * Install the app, from the boards "Install on your phone" and "Desktop: Install the app". The
 * user agent picks the steps to start with, and the browser checks again once it's running.
 */
export default async function InstallPage() {
  const me = await requireMember();
  const userAgent = (await headers()).get("user-agent");
  const device = deviceOf(userAgent);
  const phone = kindOf(device) === "phone";
  return (
    <>
      <PageHeader
        title={phone ? `Put ${APP_SHORT_NAME} on your Home Screen` : `Install ${APP_NAME}`}
        intro={
          phone
            ? "About 30 seconds and no app store. After that it opens like any other app."
            : "Put it on this computer and on your phone. No app store, and it's free. It opens in its own window, and you can read the last sync offline."
        }
        back={{ href: "/accounts", label: "accounts and sharing" }}
        large
        actions={
          <>
            <Pill tone="quiet" icon="eye">
              Read-only, never moves money
            </Pill>
            <ButtonLink href="/accounts" icon="arrow-left">
              Accounts and sharing
            </ButtonLink>
          </>
        }
      />
      <InstallGuide device={device} browser={browserOf(userAgent)} email={me.user.email} />
    </>
  );
}
