import { getLiveHealth, getShell, syncLabel } from "@/components/shell";
import { SyncNowButton } from "@/components/shell/SyncNowButton";
import { BarMeter, ButtonLink, Card, cx, Icon, Tile } from "@/components/ui";
import { LIVE_SYNC_PROVIDER as P } from "@/config/app";
import { consentLine, namesList } from "@/lib/banks/live/banks";
import styles from "./LiveSyncCard.module.css";

/**
 * The Live bank sync card on Accounts and sharing, from the "Accounts and sharing" board: when the
 * household last synced, Sync now, each bank with how long its consent has left, a way to
 * reconnect when something needs it, and the plan's bank connections in use. Shows only once live
 * sync is connected. Only the person who connected live sync gets the reconnect button.
 */
export async function LiveSyncCard() {
  const shell = await getShell();
  if (shell.live.connections === 0) return null;
  const health = await getLiveHealth();
  const label = syncLabel(shell.sync, shell.now, shell.timeZone);
  const banks = health.flatMap((connection) =>
    connection.banks.map((bank) => ({
      ...bank,
      key: `${connection.id}:${bank.name}`,
      mine: connection.mine,
      line: consentLine(bank, shell.today),
    })),
  );
  const stopped = health.filter((connection) => connection.status !== "ok");
  const cut = health.find(
    (connection) => connection.mine && connection.status === "needs_reconnect",
  );
  const stuck = banks.filter((bank) => bank.mine && bank.status === "needs_reconnect");
  const count = shell.live.banks;
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
      {stopped.map((connection) => (
        <p key={connection.id} className={cx("small", styles.warn, styles.stopped)}>
          <Icon name="alert" size="sm" />
          <span>
            {connection.status === "needs_reconnect"
              ? `Live sync stopped, so it needs a new setup token from ${P.name}.`
              : (connection.lastError ?? "The last sync didn't work. The next one will try again.")}
          </span>
        </p>
      ))}
      {banks.length > 0 && (
        <ul className={styles.banks} aria-label="Banks">
          {banks.map((bank) => (
            <li key={bank.key}>
              <div className={cx("small", styles.bankHead)}>
                <span className={styles.bankName}>{bank.name}</span>
                <span className={cx(bank.line.warn ? styles.warn : "sub", styles.consent)}>
                  {bank.line.warn && <Icon name="alert" size="sm" />}
                  {bank.line.text}
                </span>
              </div>
              {bank.line.left !== null && (
                <BarMeter
                  value={Math.round(bank.line.left * 100)}
                  max={100}
                  label={`${bank.name} consent left`}
                  valueText={bank.line.text}
                  colour="accent"
                  className={styles.bar}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {cut ? (
        <ButtonLink
          href={`/connect?reconnect=${cut.id}`}
          variant="primary"
          size="lg"
          block
          className={styles.reconnect}
        >
          Reconnect live sync
        </ButtonLink>
      ) : (
        stuck.length > 0 && (
          <ButtonLink
            href={P.url}
            target="_blank"
            rel="noopener noreferrer"
            variant="primary"
            size="lg"
            block
            className={styles.reconnect}
            aria-label={`Reconnect ${namesList(stuck.map((bank) => bank.name))} in ${P.name} (opens in a new tab)`}
          >
            <span>
              Reconnect {namesList(stuck.map((bank) => bank.name))} in {P.name}
            </span>
            <Icon name="external" size="sm" />
          </ButtonLink>
        )
      )}
      <div className={`muted tiny ${styles.plan}`}>
        <span>
          {P.plan}, {P.price}
        </span>
        {count !== null && (
          <span>
            {count} of {P.connections} bank connections used
          </span>
        )}
      </div>
    </Card>
  );
}
