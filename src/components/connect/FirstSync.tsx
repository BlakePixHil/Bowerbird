"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { accountIcon, number } from "@/components/import/labels";
import {
  Button,
  ButtonLink,
  Card,
  cx,
  Divider,
  Icon,
  Pill,
  Tile,
  WarningBanner,
  Well,
  type IconName,
} from "@/components/ui";
import { LIVE_SYNC_PROVIDER } from "@/config/app";
import type { FirstSyncProgress, SyncAccount } from "@/lib/banks/live/shapes";
import { formatShortDate } from "@/lib/money";
import { keepSyncing } from "./actions";
import styles from "./Connect.module.css";
import { ConsentNote, PhoneTop, StepRail } from "./parts";
import sync from "./Sync.module.css";
import {
  axisStart,
  backLine,
  chartTicks,
  daysBack,
  leadLine,
  oldestOf,
  pillLine,
  reachPercent,
  statusLine,
  statusWithBack,
} from "./sync-labels";

const P = LIVE_SYNC_PROVIDER;
/** How often the screen asks where the sync is up to, while it runs and the screen is showing. */
const ASK_EVERY_MS = 2000;

const NEXT: { icon: IconName; phone: [string, string]; desktop: [string, string] }[] = [
  {
    icon: "calendar",
    phone: ["Once a day, by itself", "New transactions come in without you doing anything."],
    desktop: ["Once a day", "New transactions come in by themselves."],
  },
  {
    icon: "phone",
    phone: ["When you open the app", "If the last sync was over an hour ago."],
    desktop: ["When you open the app", "If the last sync was over an hour ago."],
  },
  {
    icon: "sync",
    phone: ["Whenever you tap Sync now", "In Accounts and sharing."],
    desktop: ["With Sync now", "Any time, from Home or Accounts and sharing."],
  },
];

/**
 * Live sync step 3 of 3: the first sync bringing in each account's history. It runs on the server,
 * so the person can leave; while this screen is open it asks how far it has got, and starts the
 * next run when one ends with more to do. Drawn for the phone and desktop boards; CSS shows one.
 */
export function FirstSync({ initial }: { initial: FirstSyncProgress }) {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const [retrying, startRetry] = useTransition();
  const { connectionId } = progress;
  const settled = progress.finished || (progress.problem !== null && !progress.running);

  useEffect(() => {
    if (settled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      if (document.visibilityState === "visible") {
        try {
          const next = await keepSyncing(connectionId);
          if (!stopped && next) {
            setProgress(next);
            // The header's "Synced just now" comes from the server.
            if (next.finished) router.refresh();
          }
        } catch {
          // A dropped connection: ask again on the next tick.
        }
      }
      if (!stopped) timer = setTimeout(ask, ASK_EVERY_MS);
    };
    timer = setTimeout(ask, initial.running ? ASK_EVERY_MS : 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [settled, connectionId, initial.running, router]);

  function retry() {
    startRetry(async () => {
      const next = await keepSyncing(connectionId, true);
      if (next) setProgress(next);
    });
  }

  const total = progress.accounts.length;
  const rowsLabel = progress.finished ? "transactions brought in" : "transactions so far";
  const start = axisStart(progress);
  const oldest = oldestOf(progress);
  const days = daysBack(progress);
  const pickHref = `/connect/accounts?connection=${connectionId}`;
  const plan =
    progress.bankCount !== null
      ? `${P.name} ${P.plan}, ${progress.bankCount} of ${P.connections} bank connections used`
      : null;
  const used = progress.bankCount !== null ? Math.min(1, progress.bankCount / P.connections) : 0;

  const stoppedBanner = progress.problem && !progress.running && (
    <WarningBanner
      title="The first sync stopped."
      className={styles.banner}
      action={
        progress.problem.reconnect ? (
          <ButtonLink href="/connect" size="md">
            Reconnect
          </ButtonLink>
        ) : (
          <Button onClick={retry} disabled={retrying}>
            {retrying ? "Trying…" : "Try again"}
          </Button>
        )
      }
    >
      {progress.problem.message} Everything brought in so far stays.
    </WarningBanner>
  );

  const planLine = plan && (
    <div className={cx("muted tiny", sync.plan)}>
      <span>{plan}</span>
      <span className={sync.planBar} aria-hidden="true">
        <span style={{ width: `${used * 100}%` }} />
      </span>
    </div>
  );

  const statusIcon = (account: SyncAccount) => (
    <Icon
      name={account.status === "done" ? "check" : account.status === "busy" ? "sync" : "clock"}
      size="sm"
      className={cx(
        sync.statusIcon,
        account.status === "done" && sync.good,
        account.status === "busy" && sync.busy,
      )}
    />
  );

  // Phone -------------------------------------------------------------------

  const phone = (
    <div className={styles.phone}>
      <PhoneTop step={3} back={{ href: pickHref, label: "Back to picking accounts" }} />
      <div className={styles.intro}>
        <h1 className="h1">First sync</h1>
        <p className={cx("sub", styles.lead)}>{leadLine(progress, "screen")}</p>
      </div>
      {stoppedBanner}
      <Card as="section" className={sync.kpiCard} aria-label="So far">
        <div className={sync.kpiRow}>
          <div>
            <div className="big tnum">{number(progress.rows)}</div>
            <div className={cx("sub small", sync.kpiLabel)}>{rowsLabel}</div>
          </div>
          <div className={sync.right}>
            <div className={cx("tnum", sync.strong)}>
              {progress.done} of {total}
            </div>
            <div className={cx("sub small", sync.kpiLabelTight)}>accounts done</div>
          </div>
        </div>
        <Segments progress={progress} />
        <div className={cx("small", sync.legend)} aria-hidden="true">
          <span>
            <span className={cx(sync.key, sync.keyDone)} />
            Done
          </span>
          <span>
            <span className={cx(sync.key, sync.keyBusy)} />
            Bringing in
          </span>
        </div>
      </Card>
      <Card as="ul" className={sync.list} aria-label="Each account">
        {progress.accounts.map((account) => {
          const back = backLine(account);
          return (
            <li key={account.id} className={sync.item}>
              <div className={sync.itemTop}>
                <Tile size="sm" icon={accountIcon(account)} />
                <div className="grow">
                  <div className={cx("ellipsis", sync.name)}>{account.name}</div>
                  <div className={cx("small sub", sync.status)}>
                    {statusIcon(account)}
                    <span className="ellipsis">{statusLine(account)}</span>
                  </div>
                </div>
              </div>
              {account.status === "busy" && (
                <div className={sync.itemBar}>
                  <div className={sync.bar}>
                    <span
                      style={{ width: `${100 - reachPercent(account, start, progress.today)}%` }}
                    />
                  </div>
                  {back && <div className="muted tiny">{back}</div>}
                </div>
              )}
            </li>
          );
        })}
      </Card>
      <Card as="section" className={sync.next} aria-labelledby="next-phone">
        <h2 id="next-phone" className="h2">
          What happens next
        </h2>
        <ul>
          {NEXT.map((item) => (
            <li key={item.icon}>
              <Icon name={item.icon} />
              <div>
                <div className={sync.name}>{item.phone[0]}</div>
                <div className="sub small">{item.phone[1]}</div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card as="section" className={sync.older}>
        <Link href="/import" className={sync.olderLink}>
          <Tile size="sm" icon="upload" />
          <span className="grow">
            <span className={cx(styles.block, sync.name)}>Want older history? Upload a file</span>
            <span className={cx("sub small", styles.block)}>
              Download older history from your bank’s website. Rows already here are skipped.
            </span>
          </span>
          <Icon name="chevron-right" size="sm" className={sync.chevron} />
        </Link>
      </Card>
      {planLine}
      <div className={cx(styles.phoneActions, sync.phoneActions)}>
        <ButtonLink href="/accounts" variant="primary" size="lg" block>
          Done
        </ButtonLink>
        <ButtonLink href="/" size="lg" block>
          Go to Home
        </ButtonLink>
      </div>
    </div>
  );

  // Desktop -----------------------------------------------------------------

  const desktop = (
    <div className={styles.desktop}>
      {stoppedBanner}
      <StepRail
        at="sync"
        complete={progress.finished}
        subs={{
          pick: `${total} picked`,
          sync: progress.finished ? "Done" : "Bringing in history",
        }}
      />
      <div className={styles.layout}>
        <div className={styles.main}>
          <Card as="section" className={styles.section} aria-labelledby="sync-title">
            <div className={sync.head}>
              <div className={sync.headText}>
                <h2 id="sync-title" className={cx("h2", styles.sectionTitle)}>
                  First sync
                </h2>
                <p className={cx("sub", styles.sectionText)}>{leadLine(progress, "page")}</p>
              </div>
              <Pill
                tone={progress.finished ? "good" : progress.problem ? "warn" : "accent"}
                icon={progress.finished || progress.problem ? undefined : "sync"}
              >
                {pillLine(progress)}
              </Pill>
            </div>
            <div className={sync.kpis}>
              <div>
                <div className="big tnum">{number(progress.rows)}</div>
                <div className={cx("sub small", sync.kpiLabel)}>{rowsLabel}</div>
              </div>
              <div>
                <div className="big tnum">
                  {progress.done} of {total}
                </div>
                <div className={cx("sub small", sync.kpiLabel)}>accounts done</div>
              </div>
              {days !== null && oldest && (
                <div>
                  <div className="big tnum">{dayCount(days)}</div>
                  <div className={cx("sub small", sync.kpiLabel)}>
                    back to {formatShortDate(oldest)}
                  </div>
                </div>
              )}
            </div>
            <h3 className={cx("h3", sync.chartTitle)}>
              {progress.finished && oldest
                ? `History brought in, ${formatShortDate(oldest)} to today`
                : "History brought in so far"}
            </h3>
            <ul className={sync.chart}>
              {progress.accounts.map((account) => {
                const from = reachPercent(account, start, progress.today);
                return (
                  <li key={account.id}>
                    <div className={sync.chartHead}>
                      <span className={sync.name}>{account.name}</span>
                      <span className={cx("small sub", sync.status)}>
                        {statusIcon(account)}
                        <span>{statusWithBack(account)}</span>
                      </span>
                    </div>
                    <div className={cx(sync.bar, sync.barLg)} aria-hidden="true">
                      <span style={{ left: `${from}%`, right: 0 }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className={sync.ticks} aria-hidden="true">
              {chartTicks(start, progress.today).map((tick) => (
                <span
                  key={tick.label}
                  className="mono"
                  style={{ left: `${tick.x}%`, transform: `translateX(${tick.shift}%)` }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
            <Well className={sync.nextWell}>
              <h3 className="h3">What happens next</h3>
              <ul>
                {NEXT.map((item) => (
                  <li key={item.icon}>
                    <Icon name={item.icon} size="sm" />
                    <div className="small">
                      <div className={sync.strong}>{item.desktop[0]}</div>
                      <div className="sub">{item.desktop[1]}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Well>
            <div className={styles.cardActions}>
              <ButtonLink href={pickHref}>Back</ButtonLink>
              <ButtonLink href="/">Go to Home</ButtonLink>
              <ButtonLink href="/accounts" variant="primary">
                Done, go to Accounts and sharing
              </ButtonLink>
            </div>
          </Card>
        </div>
        <aside className={styles.aside} aria-label="About this step">
          <Card as="section" className={styles.side} aria-labelledby="older-title">
            <div className={styles.iconHead}>
              <Tile size="sm" icon="upload" />
              <h2 id="older-title" className="h2 grow">
                Want older history?
              </h2>
            </div>
            <p className={cx("small sub", sync.sideText)}>
              {progress.finished && oldest
                ? `Live sync goes back to ${formatShortDate(oldest)}.`
                : "Live sync brings in as much history as your banks share."}{" "}
              For anything older, upload a CSV, OFX or QIF file from your bank. Rows already here
              are skipped.
            </p>
            <ButtonLink href="/import" icon="upload" className={sync.sideButton}>
              Upload a file
            </ButtonLink>
            {planLine && (
              <>
                <Divider className={sync.sideDivider} />
                {planLine}
              </>
            )}
          </Card>
          <ConsentNote />
        </aside>
      </div>
    </div>
  );

  return (
    <>
      {phone}
      {desktop}
    </>
  );
}

const dayCount = (days: number) => `${number(days)} ${days === 1 ? "day" : "days"}`;

/** One segment per account: solid when done, tinted while still bringing in. */
function Segments({ progress }: { progress: FirstSyncProgress }) {
  const done = progress.done;
  const left = progress.accounts.length - done;
  return (
    <div
      className={sync.segments}
      role="img"
      aria-label={`${done} of ${progress.accounts.length} accounts done`}
    >
      {Array.from({ length: done }, (_, i) => (
        <span key={`d${i}`} className={sync.segDone} />
      ))}
      {Array.from({ length: left }, (_, i) => (
        <span key={`b${i}`} className={sync.segBusy} />
      ))}
    </div>
  );
}
