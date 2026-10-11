"use client";

import { useState } from "react";
import { APP_SHORT_NAME } from "@/config/app";
import { Button, ButtonLink, Card, cx, Tile } from "@/components/ui";
import { finishInstallPrompt } from "./actions";
import { kindOf, type Device } from "./platform";
import { useDevice } from "./store";
import styles from "./Install.module.css";

/**
 * Home's gentle, one-time prompt to install the app, once the first week is up. Closing it or
 * following it means it never shows again, and it stays away while the app runs installed.
 */
export function InstallNudge({ device: guess }: { device: Device }) {
  const device = useDevice(guess);
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const phone = kindOf(device) === "phone";

  function finish() {
    setGone(true);
    void finishInstallPrompt().catch(() => {});
  }

  return (
    <Card as="aside" aria-labelledby="install-nudge" className={cx(styles.nudge, "not-installed")}>
      <Tile icon={phone ? "install-phone" : "install-desktop"} tone="accent" />
      <div className={styles.nudgeText}>
        <h2 id="install-nudge" className="h2">
          {phone
            ? `Put ${APP_SHORT_NAME} on your Home Screen`
            : `Install ${APP_SHORT_NAME} on this computer`}
        </h2>
        <p className={cx("small sub", styles.nudgeLine)}>
          {phone
            ? "It opens like an app, with no app store. It takes about 30 seconds."
            : "It opens in its own window, like an app. It takes about a minute."}
        </p>
      </div>
      <div className={styles.nudgeActions}>
        <Button variant="ghost" onClick={finish}>
          Not now
        </Button>
        <ButtonLink href="/install" onClick={finish}>
          Show me how
        </ButtonLink>
      </div>
    </Card>
  );
}
