import { getShell, syncLabel } from "@/components/shell";
import { SyncNowButton } from "@/components/shell/SyncNowButton";
import { Card, Tile } from "@/components/ui";
import { LIVE_SYNC_PROVIDER as P } from "@/config/app";
import styles from "./LiveSyncCard.module.css";

/**
 * The Live bank sync card on Accounts and sharing, from the "Accounts and sharing" board: when the
 * household last synced, Sync now, and the plan's bank connections in use. Shows only once live
 * sync is connected. Each bank's consent comes with BUD-21.
 */
export async function LiveSyncCard() {
  const shell = await getShell();
  if (shell.live.connections === 0) return null;
  const label = syncLabel(shell.sync, shell.now, shell.timeZone);
  const banks = shell.live.banks;
  return (
    <Card as="section" aria-labelledby="live-sync-title" className={styles.card}>
      <div className={styles.head}>
        <Tile icon="sync" />
        <div className="grow">
          <h2 id="live-sync-title" className={styles.title}>
            Live bank sync
          </h2>
          <p className="muted small">
            {P.name}, read-only · {label.charAt(0).toLowerCase() + label.slice(1)}
          </p>
        </div>
        <SyncNowButton />
      </div>
      <div className={`muted tiny ${styles.plan}`}>
        <span>
          {P.plan}, {P.price}
        </span>
        {banks !== null && (
          <span>
            {banks} of {P.connections} bank connections used
          </span>
        )}
      </div>
    </Card>
  );
}
