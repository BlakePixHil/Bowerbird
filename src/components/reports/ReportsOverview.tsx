import Link from "next/link";
import type { ReactNode } from "react";
import { dollars } from "@/components/budgets/budgets";
import { Legend } from "@/components/charts";
import type { ReportEntry } from "@/components/shell/nav";
import { Card, cx, Icon } from "@/components/ui";
import { formatPercent } from "@/lib/money";
import {
  isWaiting,
  type InOutCardData,
  type LeftOverCardData,
  type PlanCardData,
  type ReportsData,
} from "./cards";
import styles from "./Reports.module.css";

/**
 * The Reports page's cards, from the board "Reports": each report's question, a headline number
 * and a small chart, opening the report. Later phases' reports get a card here when they ship.
 */

type CardProps = { report: ReportEntry; data: ReportsData };

/** The money in bars rise this far above the zero line, and money out drops this far below it. */
const IN_PX = 49;
const OUT_PX = 37;

const px = (value: number) => `${Math.max(0, Math.round(value * 10) / 10)}px`;
const pct = (value: number) => `${Math.max(0, Math.round(value * 10) / 10)}%`;

function ReportCard({
  report,
  wide = false,
  children,
}: {
  report: ReportEntry;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Card as="article" className={cx(styles.card, wide ? styles.wide : styles.small)}>
      <div className={styles.head}>
        <h2 className={cx("h2", styles.title)}>
          <Link href={report.href} className={styles.stretched}>
            {report.label}
          </Link>
        </h2>
        {wide && <Icon name="chevron-right" size="sm" className="muted" />}
      </div>
      <p className={cx("muted", wide ? "small" : "tiny", styles.question)}>{report.short}</p>
      {children}
    </Card>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className={cx("small sub", styles.note)}>{children}</p>;
}

/** Money in rises from the zero line and money out drops below it, this month lighter. */
function InOutMini({ months }: { months: InOutCardData["months"] }) {
  const top = Math.max(1, ...months.flatMap((m) => [m.inCents, m.outCents]));
  return (
    <div
      className={styles.inOut}
      style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {months.map((m) => (
        <span key={m.key} className={cx(styles.slot, m.partial && styles.partial)}>
          <span className={styles.inBar} style={{ height: px((m.inCents / top) * IN_PX) }} />
          <span className={styles.outBar} style={{ height: px((m.outCents / top) * OUT_PX) }} />
        </span>
      ))}
    </div>
  );
}

function InOutCard({ report, data }: CardProps) {
  const card = data.inOut;
  return (
    <ReportCard report={report} wide>
      {isWaiting(card) ? (
        <Note>{card.note}</Note>
      ) : (
        <>
          <div className={styles.figures}>
            <div>
              <div className="muted tiny">In, {card.when}</div>
              <div className="mid tnum">{dollars(card.in)}</div>
            </div>
            <div>
              <div className="muted tiny">Out, {card.when}</div>
              <div className="mid tnum">{dollars(card.out)}</div>
            </div>
          </div>
          <InOutMini months={card.months} />
          <div className={styles.axis} aria-hidden="true">
            <span>{card.from}</span>
            <span>{card.to}</span>
          </div>
          <Legend
            className={styles.legend}
            items={[
              { label: "Money in", colour: "pos", kind: "square" },
              { label: "Money out", colour: "neg", kind: "square" },
            ]}
          />
        </>
      )}
    </ReportCard>
  );
}

/** Each month's share kept, faint, with last month's in colour and the average as a line. */
function KeptMini({ card }: { card: LeftOverCardData }) {
  const shares = card.shares.map((share) => share ?? 0);
  const hi = Math.max(0.4, ...shares);
  const lo = Math.min(0, ...shares);
  // As a share of the chart's height, which CSS sets: short on a phone, taller on desktop.
  const at = (share: number) => ((share - lo) / (hi - lo)) * 100;
  const zero = at(0);
  return (
    <div
      className={styles.kept}
      style={{ gridTemplateColumns: `repeat(${shares.length}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {card.average !== null && (
        <span className={styles.average} style={{ bottom: pct(at(card.average)) }} />
      )}
      {shares.map((share, i) => {
        const last = i === shares.length - 1;
        const tone = last ? (share < 0 ? styles.below : styles.last) : undefined;
        const size = pct(Math.abs(at(share) - zero));
        return (
          <span key={i} className={styles.slot}>
            <span
              className={cx(styles.keptBar, share < 0 && styles.down, tone)}
              style={
                share < 0
                  ? { top: pct(100 - zero), height: size }
                  : { bottom: pct(zero), height: size }
              }
            />
          </span>
        );
      })}
    </div>
  );
}

function LeftOverCard({ report, data }: CardProps) {
  const card = data.leftOver;
  if (isWaiting(card))
    return (
      <ReportCard report={report}>
        <Note>{card.note}</Note>
      </ReportCard>
    );
  const line =
    card.share === null
      ? `nothing came in during ${card.month}`
      : card.share < 0
        ? `spent more than pay in ${card.month}`
        : `of pay kept in ${card.month}`;
  return (
    <ReportCard report={report}>
      <span className={cx("mid tnum", styles.value)}>{formatPercent(card.share)}</span>
      <span className="small sub">{line}</span>
      <span className={styles.spacer} />
      <KeptMini card={card} />
    </ReportCard>
  );
}

function PlanMarks({ marks }: { marks: PlanCardData["marks"] }) {
  return (
    <div className={styles.marks} aria-hidden="true">
      {marks.map((mark) => (
        <span key={mark.key} className={cx(styles.mark, mark.over && styles.over)}>
          {mark.over ? "!" : ""}
        </span>
      ))}
    </div>
  );
}

function PlanCard({ report, data }: CardProps) {
  const card = data.plan;
  if (isWaiting(card))
    return (
      <ReportCard report={report}>
        <Note>{card.note}</Note>
      </ReportCard>
    );
  return (
    <ReportCard report={report}>
      <span className={cx("mid tnum", styles.value)}>
        {card.on} of {card.of}
      </span>
      <span className="small sub">on plan {card.when}</span>
      <span className={styles.spacer} />
      <PlanMarks marks={card.marks} />
    </ReportCard>
  );
}

/**
 * Each report with a card, in the board's order. A report only shows once its feature is on (see
 * `visible`), and turning one on means adding its card here.
 */
export const REPORT_CARDS: readonly { href: string; Card: (props: CardProps) => ReactNode }[] = [
  { href: "/reports/money-in-out", Card: InOutCard },
  { href: "/reports/money-in-out#left-over", Card: LeftOverCard },
  { href: "/budgets#plan-vs-reality", Card: PlanCard },
];

/** The cards for the reports that are on. */
export function ReportsOverview({
  reports,
  data,
}: {
  reports: readonly ReportEntry[];
  data: ReportsData;
}) {
  const on = new Map(reports.map((report) => [report.href, report]));
  return (
    <div className={styles.grid}>
      {REPORT_CARDS.flatMap(({ href, Card: ReportCardFor }) => {
        const report = on.get(href);
        return report ? [<ReportCardFor key={href} report={report} data={data} />] : [];
      })}
    </div>
  );
}
