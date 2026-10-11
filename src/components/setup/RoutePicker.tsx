"use client";

import { useState } from "react";
import {
  ButtonLink,
  Card,
  cx,
  Divider,
  Icon,
  Tag,
  Tile,
  Well,
  type IconName,
} from "@/components/ui";
import { APP_NAME, LIVE_SYNC_PROVIDER } from "@/config/app";
import styles from "./Setup.module.css";

const P = LIVE_SYNC_PROVIDER;

type Route = "sync" | "files";

type Line = { icon: IconName; text: string; wide?: boolean };

const OPTIONS: readonly {
  key: Route;
  title: string;
  tag: string;
  icon: IconName;
  lines: Line[];
}[] = [
  {
    key: "sync",
    title: `Live sync with ${P.name}`,
    tag: "Optional",
    icon: "sync",
    lines: [
      { icon: "clock", text: "Automatic, once a day and whenever you open the app." },
      { icon: "piggy", text: `${P.price}, paid to ${P.name}, not to us.` },
      { icon: "bank", text: "Connect your banks on each bank’s own consent screen.", wide: true },
    ],
  },
  {
    key: "files",
    title: "Upload bank files",
    tag: "Free",
    icon: "upload",
    lines: [
      { icon: "check", text: "Always works. CSV, OFX or QIF from any bank." },
      { icon: "file", text: "Download a file from each bank about every few weeks." },
    ],
  },
];

const ROWS: readonly { label: string; sync: string; files: string; wide?: boolean }[] = [
  { label: "Cost", sync: P.price, files: "Free" },
  { label: "Effort", sync: "Set up once", files: "A few minutes every few weeks" },
  { label: "How up to date", sync: "Within a day", files: "As of your last upload" },
  {
    label: "How far back",
    sync: "As much as your banks share",
    files: "As far back as your bank lets you download",
    wide: true,
  },
];

const NEXT: Record<Route, { sub: string; steps: string[]; trust: string }> = {
  sync: {
    sub: "Live sync, about 10 minutes",
    steps: [
      `Sign up at ${P.name} on the ${P.plan}, ${P.price}.`,
      "Connect your banks on each bank’s own consent screen.",
      `Copy the setup token ${P.name} gives you and paste it here.`,
      "Pick which accounts to bring in and who can see each.",
    ],
    trust: `${APP_NAME} keeps only an encrypted access link from ${P.name}, never a bank password.`,
  },
  files: {
    sub: "Bank files, about 5 minutes",
    steps: [
      "Download a CSV, OFX or QIF file from your bank’s website.",
      "Drop the file onto the account it came from.",
      "Check the preview. Rows that are already here are skipped.",
      "Do it again every few weeks, or switch on live sync later.",
    ],
    trust: `Files stay in your household. ${APP_NAME} never asks for a bank password.`,
  },
};

const GO: Record<Route, { href: string; label: string; note: string }> = {
  sync: {
    href: "/connect",
    label: "Continue with live sync",
    note: `Next: connect your banks in ${P.name}`,
  },
  files: {
    href: "/import",
    label: "Continue with bank files",
    note: "Next: upload your first bank file",
  },
};

/**
 * Step 2: live sync or bank files, side by side, then off to that flow. It comes back to setup
 * when it's done. Starts on live sync, as on the board, unless it can't be used on this server.
 */
export function RoutePicker({ liveReady, back }: { liveReady: boolean; back: string }) {
  const [route, setRoute] = useState<Route>(liveReady ? "sync" : "files");
  const go = GO[route];
  const next = NEXT[route];
  const isSync = route === "sync";
  return (
    <div className={styles.body}>
      <div role="group" aria-label="How transactions get in" className={styles.options}>
        {OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={option.key === route}
            className={styles.option}
            onClick={() => setRoute(option.key)}
          >
            <Tile icon={option.icon} className={styles.optionTile} />
            <span className={cx("grow", styles.optionBody)}>
              <span className={styles.optionHead}>
                <span className={styles.optionTitle}>{option.title}</span>
                <Tag>{option.tag}</Tag>
              </span>
              {option.lines.map((line) => (
                <span
                  key={line.text}
                  className={cx("small sub", styles.optionLine, line.wide && styles.wideOnly)}
                >
                  <Icon name={line.icon} size="sm" />
                  <span>{line.text}</span>
                </span>
              ))}
            </span>
            <span className={styles.radio} aria-hidden="true">
              <span />
            </span>
          </button>
        ))}
      </div>

      <div className={styles.flow}>
        <Card as="section" className={styles.compare} aria-labelledby="compare-title">
          <h2 id="compare-title" className={cx("h2", styles.wideOnly)}>
            Side by side
          </h2>
          <div role="table" aria-label="Live sync and bank files compared">
            <div role="row" className={cx(styles.compareRow, styles.compareHead)}>
              <span role="columnheader" className={cx("tiny muted", styles.corner)}>
                Compare
              </span>
              <span
                role="columnheader"
                className={cx("small", styles.colHead, isSync && styles.colHeadOn)}
              >
                <Icon name="sync" size="sm" />
                Live sync
              </span>
              <span
                role="columnheader"
                className={cx("small", styles.colHead, !isSync && styles.colHeadOn)}
              >
                <Icon name="upload" size="sm" />
                Bank files
              </span>
            </div>
            {ROWS.map((row) => (
              <div
                key={row.label}
                role="row"
                className={cx(styles.compareRow, row.wide && styles.wideOnly)}
              >
                <span role="rowheader" className="small muted">
                  {row.label}
                </span>
                <span role="cell" className={cx("small", isSync ? styles.cellOn : styles.cell)}>
                  {row.sync}
                </span>
                <span role="cell" className={cx("small", isSync ? styles.cell : styles.cellOn)}>
                  {row.files}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card
          as="section"
          className={cx(styles.next, styles.wideOnly)}
          aria-labelledby="next-title"
        >
          <h2 id="next-title" className="h2">
            What happens next
          </h2>
          <p className="muted small">{next.sub}</p>
          <ol className={styles.nextList}>
            {next.steps.map((step, i) => (
              <li key={step} className="small">
                <span className={cx("mono tnum", styles.nextNum)}>{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <Divider className={styles.nextDivider} />
          <p className={cx("small sub", styles.trust)}>
            <Icon name="lock" size="sm" />
            <span>{next.trust}</span>
          </p>
        </Card>
      </div>

      <Well className={styles.hint}>
        <Icon name="info" size="sm" />
        <span className="small sub">
          You can start with files and switch on live sync later without losing anything. Rows that
          are already here are skipped.
        </span>
      </Well>

      <div className={styles.actions}>
        <ButtonLink href={back} size="lg" icon="arrow-left" className={styles.back}>
          Back
        </ButtonLink>
        <ButtonLink
          href={go.href}
          variant="primary"
          size="lg"
          className={styles.go}
          aria-label={go.label}
        >
          <span className={styles.wideOnly}>{go.label}</span>
          <span className={styles.phoneOnly}>Continue</span>
        </ButtonLink>
        <span className={cx("muted tiny", styles.goNote)}>{go.note}</span>
      </div>
    </div>
  );
}
