"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { InOutBars, Key, KeptBars, Legend, shortMoney } from "@/components/charts";
import {
  BarMeter,
  Card,
  Chip,
  colourVar,
  cx,
  Divider,
  Kpi,
  KpiGrid,
  Pill,
  StackedBar,
  Well,
} from "@/components/ui";
import { formatMoney, formatPercent } from "@/lib/money";
import {
  bestAndWorst,
  changeLine,
  keptFacts,
  monthStatus,
  RANGES,
  signedDiff,
  summaryWords,
  totalLabel,
  vsUsual,
  type MoneyReport,
  type ReportMonth,
  type ReportRange,
} from "./money";
import styles from "./MoneyInOut.module.css";

const dollars = (cents: number) => formatMoney(Math.round(cents), { decimals: "never" });
const letters = (months: readonly ReportMonth[]) =>
  months.map((month) => ({ ...month, label: month.label[0] }));
const rangeName = (report: MoneyReport) =>
  report.months.length === 1 ? "last month" : `last ${report.months.length} months`;

/** 12 months or This financial year. Changing range loads the page again with its months. */
export function RangeChips({ range }: { range: ReportRange }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className={styles.chips} aria-busy={pending}>
      {RANGES.map((choice) => (
        <Chip
          key={choice.value}
          on={choice.value === range}
          onClick={() =>
            startTransition(() =>
              router.replace(
                choice.value === "fy" ? "/reports/money-in-out?range=fy" : "/reports/money-in-out",
                { scroll: false },
              ),
            )
          }
        >
          {choice.label}
        </Chip>
      ))}
    </div>
  );
}

/** The range chips on a phone, where the header has no room for them. */
export function PhoneRangeChips({ range }: { range: ReportRange }) {
  return (
    <div className={styles.phoneOnly}>
      <RangeChips range={range} />
    </div>
  );
}

function Summary({ report }: { report: MoneyReport }) {
  return (
    <p className={styles.summary}>
      {summaryWords(report).map((words, i) =>
        words.strong ? (
          <span key={i} className={cx("tnum", styles.strong)}>
            {words.text}
          </span>
        ) : (
          words.text
        ),
      )}
    </p>
  );
}

/** The phone's three tiles: In, Out and the share kept. */
function Tiles({ report }: { report: MoneyReport }) {
  const tiles = [
    { label: "In", colour: "var(--in)", value: shortMoney(report.totals.in) },
    { label: "Out", colour: "var(--out)", value: shortMoney(report.totals.out) },
    { label: "Kept", colour: "var(--left)", value: formatPercent(report.totals.share) },
  ];
  return (
    <ul className={cx(styles.tiles, styles.phoneOnly)}>
      {tiles.map((tile) => (
        <Card as="li" key={tile.label} className={styles.tile}>
          <span className={cx("tiny sub", styles.keyed)}>
            <span className={styles.key} style={{ background: tile.colour }} aria-hidden="true" />
            {tile.label}
          </span>
          <span className={cx("tnum", styles.tileValue)}>{tile.value}</span>
        </Card>
      ))}
    </ul>
  );
}

/** Desktop's four headline numbers. */
function Kpis({ report }: { report: MoneyReport }) {
  const extremes = bestAndWorst(report);
  return (
    <div className={styles.wideOnly}>
      <KpiGrid>
        <Kpi
          label="Money in"
          value={dollars(report.totals.in)}
          detail={`${dollars(report.average.in)} a month on average`}
        />
        <Kpi
          label="Money out"
          value={dollars(report.totals.out)}
          detail={`${dollars(report.average.out)} a month on average`}
        />
        <Kpi
          label="What's left over"
          value={dollars(report.totals.kept)}
          detail={`${formatPercent(report.totals.share)} of everything that came in`}
        />
        {extremes && (
          <Kpi label="Best and worst months" value={extremes.value} detail={extremes.line} />
        )}
      </KpiGrid>
    </div>
  );
}

function EachMonth({
  report,
  month,
  pick,
}: {
  report: MoneyReport;
  month: ReportMonth;
  pick: (key: string) => void;
}) {
  const label = `Money in and out, ${rangeName(report)}`;
  return (
    <Card as="section" className={cx(styles.card, styles.w2)} aria-labelledby="each-month">
      <div className={styles.head}>
        <h2 id="each-month" className="h2">
          Each month
        </h2>
        <span className="small muted">
          <span className={styles.phoneInline}>Tap a month</span>
          <span className={styles.wideInline}>Click a month to pin it</span>
        </span>
      </div>
      <Well className={cx(styles.monthWell, styles.phoneOnly)}>
        <span className={styles.monthName}>{month.name}</span>
        <span className="small tnum">
          <span className="muted">In </span>
          {dollars(month.inCents)}
        </span>
        <span className="small tnum">
          <span className="muted">Out </span>
          {dollars(month.outCents)}
        </span>
        <span className="small tnum">
          <span className="muted">Kept </span>
          {formatPercent(month.share)}
        </span>
      </Well>
      <div className={cx(styles.chart, styles.phoneOnly)}>
        <InOutBars
          label={label}
          months={letters(report.months)}
          selected={month.key}
          onSelect={pick}
          height={188}
          legend={false}
        />
      </div>
      <div className={cx(styles.chart, styles.wideOnly)}>
        <InOutBars
          label={label}
          months={report.months}
          selected={month.key}
          onSelect={pick}
          height={300}
        />
      </div>
    </Card>
  );
}

/** Desktop: the picked month against a usual month in the range. */
function MonthCard({ report, month }: { report: MoneyReport; month: ReportMonth }) {
  const status = monthStatus(month, report);
  const scale = Math.max(1, ...report.months.flatMap((m) => [m.inCents, m.outCents]));
  const rows = [
    {
      label: "Money in",
      colour: "pos" as const,
      cents: month.inCents,
      usual: report.average.in,
      vs: vsUsual(month.inCents, report.average.in, "came in"),
    },
    {
      label: "Money out",
      colour: "neg" as const,
      cents: month.outCents,
      usual: report.average.out,
      vs: vsUsual(month.outCents, report.average.out, "went out"),
    },
  ];
  return (
    <Card
      as="section"
      className={cx(styles.card, styles.w1, styles.column, styles.wideOnly)}
      aria-labelledby="picked-month"
    >
      <div className={styles.head}>
        <h2 id="picked-month" className="h2">
          {month.long}
        </h2>
        <Pill tone={status.tone} icon={status.icon}>
          {status.text}
        </Pill>
      </div>
      <div>
        <div className="eyebrow">What&apos;s left over</div>
        <div className={styles.bigLine}>
          <span className="big tnum">{dollars(month.kept)}</span>
          <span className="sub small tnum">{formatPercent(month.share)} of pay</span>
        </div>
      </div>
      <div className={styles.compare}>
        {rows.map((row) => (
          <div key={row.label}>
            <div className={cx("small", styles.keyedRow)}>
              <span
                className={styles.key}
                style={{ background: colourVar(row.colour) }}
                aria-hidden="true"
              />
              <span className="grow">{row.label}</span>
              <span className={cx("tnum", styles.medium)}>{dollars(row.cents)}</span>
            </div>
            <BarMeter
              className={styles.compareBar}
              value={row.cents}
              max={scale}
              today={row.usual / scale}
              colour={row.colour}
              label={`${row.label} in ${month.long}`}
              valueText={`${dollars(row.cents)}, usually ${dollars(row.usual)}`}
            />
            <div className={cx("tiny muted tnum", styles.vs)}>{row.vs}</div>
          </div>
        ))}
      </div>
      <Legend
        className={styles.foot}
        items={[{ label: `${report.months.length}-month average`, colour: "text", kind: "tick" }]}
      />
    </Card>
  );
}

function LeftOver({ report, month }: { report: MoneyReport; month: ReportMonth }) {
  const facts = keptFacts(report);
  const label = `Share of pay kept, ${rangeName(report)}`;
  const kept = report.months.map(({ key, label: short, name, share, kept }) => ({
    key,
    label: short,
    name,
    share,
    kept,
  }));
  return (
    <Card
      as="section"
      id="left-over"
      className={cx(styles.card, styles.w2, styles.anchor)}
      aria-labelledby="left-over-title"
    >
      <div className={styles.head}>
        <h2 id="left-over-title" className="h2">
          What&apos;s left over
        </h2>
        <span className="small muted">
          <span className={styles.phoneInline}>Share of pay kept</span>
          <span className={styles.wideInline}>Share of pay kept each month</span>
        </span>
      </div>
      <div className={cx(styles.keptChart, styles.phoneOnly)}>
        <KeptBars
          label={label}
          months={kept.map((m) => ({ ...m, label: m.label[0] }))}
          average={report.totals.share}
          selected={month.key}
          height={96}
        />
      </div>
      <div className={cx(styles.keptChart, styles.wideOnly)}>
        <KeptBars
          label={label}
          months={kept}
          average={report.totals.share}
          selected={month.key}
          height={140}
          averageSide="left"
        />
      </div>
      {facts && <p className={cx("sub small", styles.note)}>{facts}</p>}
    </Card>
  );
}

function WentTo({ month }: { month: ReportMonth }) {
  const { rows, total } = month.went;
  const scale = Math.max(1, ...rows.flatMap((row) => [row.cents, row.usual ?? 0]));
  const line = changeLine(month);
  const hasUsual = rows.some((row) => row.usual !== null);
  return (
    <Card as="section" className={cx(styles.card, styles.w2, styles.went)} aria-labelledby="went">
      <div className={styles.headWrap}>
        <div className={styles.titled}>
          <h2 id="went" className="h2">
            Where it went in {month.word}
          </h2>
          <span className="muted small tnum">{dollars(total)}</span>
        </div>
        {hasUsual && (
          <Legend
            items={[{ label: "Your usual month (6-month average)", colour: "text", kind: "tick" }]}
          />
        )}
      </div>
      {rows.length === 0 ? (
        <p className={cx("sub small", styles.note)}>Nothing went out in {month.word}.</p>
      ) : (
        <ul className={styles.bars}>
          {rows.map((row) => (
            <li key={row.key} className={styles.barRow}>
              <span className="small ellipsis">{row.name}</span>
              <span
                className={styles.track}
                role="img"
                aria-label={`${row.name}: ${dollars(row.cents)}${row.usual === null ? "" : `, usually ${dollars(row.usual)}`}`}
              >
                <span
                  className={styles.fill}
                  style={{
                    width: `${(row.cents / scale) * 100}%`,
                    background: colourVar(row.colour),
                  }}
                />
                {row.usual !== null && (
                  <span
                    className={styles.usual}
                    style={{ left: `${(row.usual / scale) * 100}%` }}
                  />
                )}
              </span>
              <span className="small tnum">{dollars(row.cents)}</span>
            </li>
          ))}
        </ul>
      )}
      {line && (
        <Well className={cx(styles.changeWell, styles.phoneOnly)}>
          <span className="small">{line}</span>
        </Well>
      )}
    </Card>
  );
}

/** Desktop: the categories furthest from their usual month, usual and this month as two dots. */
function Changes({ month }: { month: ReportMonth }) {
  const { changes } = month.went;
  const scale = Math.max(1, ...changes.flatMap((c) => [c.cents, c.usual])) * 1.1;
  const hasUsual = month.went.rows.some((row) => row.usual !== null);
  return (
    <Card
      as="section"
      className={cx(styles.card, styles.w1, styles.column, styles.wideOnly)}
      aria-labelledby="changes"
    >
      <h2 id="changes" className="h2">
        Biggest changes from usual
      </h2>
      {changes.length === 0 ? (
        <p className={cx("sub small", styles.note)}>
          {hasUsual
            ? `Every category in ${month.word} was within $10 of its usual month.`
            : `There's no earlier month to compare ${month.word} with yet.`}
        </p>
      ) : (
        <ul className={styles.changes}>
          {changes.map((change) => {
            const from = (Math.min(change.usual, change.cents) / scale) * 100;
            const to = (Math.max(change.usual, change.cents) / scale) * 100;
            return (
              <li key={change.key}>
                <div className={cx("small", styles.keyedRow)}>
                  <span className={cx("grow", styles.medium)}>{change.name}</span>
                  <span className={cx("tnum", styles.strong)}>{signedDiff(change.diff)}</span>
                </div>
                <div className={styles.dumbbell} aria-hidden="true">
                  <span
                    className={styles.span}
                    style={{ left: `${from}%`, width: `${to - from}%` }}
                  />
                  <span
                    className={styles.dot}
                    style={{ left: `${(change.usual / scale) * 100}%`, background: "var(--ghost)" }}
                  />
                  <span
                    className={styles.dot}
                    style={{ left: `${(change.cents / scale) * 100}%`, background: "var(--out)" }}
                  />
                </div>
                <div className={cx("tiny muted tnum", styles.vs)}>
                  {dollars(change.usual)} usually, {dollars(change.cents)} in {month.word}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Legend
        className={styles.foot}
        items={[
          { label: "Usual", colour: "ghost", kind: "dot" },
          { label: month.word, colour: "neg", kind: "dot" },
        ]}
      />
    </Card>
  );
}

function CameFrom({ month }: { month: ReportMonth }) {
  const { came } = month;
  return (
    <Card as="section" className={cx(styles.card, styles.w1, styles.came)} aria-labelledby="came">
      <h2 id="came" className="h2">
        Where it came from in {month.word}
      </h2>
      {came.length === 0 ? (
        <p className={cx("sub small", styles.note)}>Nothing came in in {month.word}.</p>
      ) : (
        <>
          <StackedBar
            className={styles.stack}
            label={`Where money came from in ${month.long}`}
            parts={came.map((row) => ({ label: row.label, value: row.cents, colour: row.colour }))}
            formatValue={dollars}
            height={12}
          />
          <ul className={styles.sources}>
            {came.map((row) => (
              <li key={row.key} className={cx("small", styles.keyedRow)}>
                <Key colour={row.colour} kind="square" />
                <span className="grow sub ellipsis">{row.label}</span>
                <span className="tnum">{dollars(row.cents)}</span>
              </li>
            ))}
          </ul>
          <div className={styles.wideOnly}>
            <Divider className={styles.totalRule} />
            <div className={cx("small", styles.total)}>
              <span className="sub">Total in</span>
              <span className={cx("tnum", styles.strong)}>{dollars(month.inCents)}</span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/** Desktop: every month as a row, the picked one highlighted, with the range's total. */
function MonthTable({
  report,
  month,
  pick,
}: {
  report: MoneyReport;
  month: ReportMonth;
  pick: (key: string) => void;
}) {
  const scale = Math.max(0.1, ...report.months.map((m) => m.share ?? 0));
  const shareCell = (share: number | null) => (
    <span role="cell" className={styles.shareCell}>
      <BarMeter
        className={styles.thinBar}
        value={Math.max(0, share ?? 0)}
        max={scale}
        colour="pos"
        label="Share kept"
        valueText={formatPercent(share)}
      />
      <span className={cx("tnum", styles.num)}>{formatPercent(share)}</span>
    </span>
  );
  return (
    <Card as="section" className={cx(styles.tableCard, styles.wideOnly)} aria-labelledby="table">
      <div className={styles.tableHead}>
        <h2 id="table" className="h2">
          Each month as a table
        </h2>
      </div>
      <div className={styles.scroll}>
        <div role="table" aria-label="Money in and out by month" className={styles.table}>
          <div role="row" className={cx("small muted", styles.cols, styles.colHead)}>
            <span role="columnheader">Month</span>
            <span role="columnheader" className={styles.num}>
              Money in
            </span>
            <span role="columnheader" className={styles.num}>
              Money out
            </span>
            <span role="columnheader" className={styles.num}>
              Left over
            </span>
            <span role="columnheader">Share kept</span>
          </div>
          {report.months.map((m) => (
            <div
              role="row"
              key={m.key}
              className={cx(styles.cols, styles.tableRow, m.key === month.key && styles.picked)}
            >
              <span role="cell">
                <button
                  type="button"
                  className={styles.pickMonth}
                  aria-pressed={m.key === month.key}
                  onClick={() => pick(m.key)}
                >
                  {m.long}
                </button>
              </span>
              <span role="cell" className={cx("tnum", styles.num)}>
                {dollars(m.inCents)}
              </span>
              <span role="cell" className={cx("tnum", styles.num)}>
                {dollars(m.outCents)}
              </span>
              <span role="cell" className={cx("tnum", styles.num)}>
                {dollars(m.kept)}
              </span>
              {shareCell(m.share)}
            </div>
          ))}
          <div role="row" className={cx(styles.cols, styles.tableRow, styles.totalRow)}>
            <span role="cell">{totalLabel(report)}</span>
            <span role="cell" className={cx("tnum", styles.num)}>
              {dollars(report.totals.in)}
            </span>
            <span role="cell" className={cx("tnum", styles.num)}>
              {dollars(report.totals.out)}
            </span>
            <span role="cell" className={cx("tnum", styles.num)}>
              {dollars(report.totals.kept)}
            </span>
            {shareCell(report.totals.share)}
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Money in, money out, from its phone and desktop boards. Every month's numbers come with the
 * page, so picking a month is instant; the month goes in the address so a link opens on it.
 */
export function MoneyInOutReport({ report, initial }: { report: MoneyReport; initial: string }) {
  const [selected, setSelected] = useState(initial);
  const month = report.months.find((m) => m.key === selected) ?? report.months.at(-1)!;
  const pick = (key: string) => {
    setSelected(key);
    const url = new URL(window.location.href);
    url.searchParams.set("month", key);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };
  return (
    <div className={styles.page}>
      <PhoneRangeChips range={report.range} />
      <Summary report={report} />
      <Tiles report={report} />
      <Kpis report={report} />
      <div className={styles.flow}>
        <EachMonth report={report} month={month} pick={pick} />
        <MonthCard report={report} month={month} />
      </div>
      <div className={styles.flow}>
        <LeftOver report={report} month={month} />
        <CameFrom month={month} />
      </div>
      <div className={styles.flow}>
        <WentTo month={month} />
        <Changes month={month} />
      </div>
      <MonthTable report={report} month={month} pick={pick} />
    </div>
  );
}
