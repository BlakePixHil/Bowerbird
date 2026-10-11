import Link from "next/link";
import { ButtonLink, Card, cx, Divider, Icon, Pill, TextLink, Tile } from "@/components/ui";
import { APP_NAME, LIVE_SYNC_PROVIDER } from "@/config/app";
import styles from "./Activity.module.css";

/** The phone's last card: "Missing something? Import a CSV or OFX file from your bank". */
export function MissingSomething() {
  return (
    <Link href="/import" className={styles.missing}>
      <Tile icon="upload" size="sm" />
      <span className={styles.missingText}>
        <span className={styles.missingTitle}>Missing something?</span>
        <span className="muted small">Import a CSV or OFX file from your bank</span>
      </span>
      <Icon name="chevron-right" size="sm" />
    </Link>
  );
}

/** Beside the list on desktop: import a file, and a word about live sync if it isn't set up. */
export function ImportCard({ liveSync }: { liveSync: boolean }) {
  return (
    <Card as="section" aria-labelledby="import-title" className={styles.importCard}>
      <div className={styles.importHead}>
        <h2 id="import-title" className="h2">
          Missing something?
        </h2>
        <Pill tone="quiet" icon={null}>
          Free
        </Pill>
      </div>
      <div className={styles.importBox}>
        <div className={styles.importLine}>
          <Tile icon="upload" size="sm" />
          <div>
            <div className={cx("small", styles.importTitle)}>Import a CSV or OFX file</div>
            <div className="tiny muted">Export it from your bank&rsquo;s website</div>
          </div>
        </div>
        <ButtonLink href="/import" block>
          Choose a file
        </ButtonLink>
      </div>
      <p className={cx("small sub", styles.importNote)}>
        <Icon name="shield-plain" size="sm" />
        <span>
          CSV or OFX import is free and always works. {APP_NAME} only reads the file, it never moves
          money.
        </span>
      </p>
      {!liveSync && (
        <>
          <Divider />
          <p className={cx("small", styles.importSync)}>
            <span className="muted">
              Want it to happen by itself? Live sync with {LIVE_SYNC_PROVIDER.name} is optional,{" "}
              {LIVE_SYNC_PROVIDER.price}.
            </span>
            <TextLink href="/connect">Set up</TextLink>
          </p>
        </>
      )}
    </Card>
  );
}
