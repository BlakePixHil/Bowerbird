import {
  categoryLabel,
  partsLine,
  rowAmount,
  rowIcon,
  whoseLook,
} from "@/components/activity/look";
import { dollars } from "@/components/budgets/budgets";
import { lineStatus, type Status } from "@/components/budgets/progress";
import { colourOf } from "@/components/categories/look";
import { InOutBars, RunningTotalChart, type InOutMonth } from "@/components/charts";
import {
  Avatar,
  BarMeter,
  Card,
  colourVar,
  cx,
  Icon,
  Kpi,
  KpiGrid,
  Pill,
  Tag,
  TextLink,
  Tile,
  Well,
} from "@/components/ui";
import type { ActivityRow, BudgetProgress } from "@/lib/access";
import { formatMoney, formatPercent, ratio } from "@/lib/money";
import { categoryColour } from "@/lib/sorting/colour";
import {
  billsKpi,
  inOutCard,
  leftKpiLine,
  leftToSpend,
  midTick,
  spendingPace,
  whenWords,
} from "./home";
import type { HomeData } from "./HomeOverview";
import styles from "./Home.module.css";

/** How many transactions Latest lists on desktop. */
export const DESKTOP_LATEST_ROWS = 10;

function StatusWords({ status }: { status: Status }) {
  return (
    <span className={cx("tiny", styles.statusWords, styles[status.tone])}>
      <Icon name={status.icon} size="sm" />
      <span>{status.text}</span>
    </span>
  );
}

function Kpis({ data }: { data: HomeData }) {
  const left = leftToSpend(data.progress);
  const bills = billsKpi(data.progress);
  const money = inOutCard(data.money, data.progress.period, data.progress.spec);
  return (
    <KpiGrid>
      {left && (
        <Kpi
          label="Left to spend"
          href="/budgets"
          value={left.hero}
          detail={leftKpiLine(left)}
          badge={
            left.pace.tone !== "plain" && (
              <Pill tone={left.pace.tone} icon={left.pace.icon}>
                {left.pace.text}
              </Pill>
            )
          }
        >
          <BarMeter
            value={left.spent}
            max={left.planned}
            today={left.today}
            label="Everyday spending so far"
            valueText={`${dollars(left.spent)} of ${dollars(left.planned)}`}
          />
        </Kpi>
      )}
      <Kpi label="Left over so far" href="/reports/money-in-out#left-over" value={money.left}>
        <div className={styles.miniInOut}>
          <span className="tiny sub">In</span>
          <span className={styles.miniTrack} aria-hidden="true">
            <span className={styles.inBar} style={{ width: `${money.inPct}%` }} />
          </span>
          <span className="tiny tnum">{money.in}</span>
          <span className="tiny sub">Out</span>
          <span className={styles.miniTrack} aria-hidden="true">
            <span className={styles.outBar} style={{ width: `${money.outPct}%` }} />
          </span>
          <span className="tiny tnum">{money.out}</span>
        </div>
      </Kpi>
      {bills && (
        <Kpi label="Bills still to come" href="/budgets" value={bills.toCome} detail={bills.line}>
          <BarMeter
            value={bills.paid}
            max={bills.planned}
            colour="ghost"
            label="Bills paid so far"
            valueText={bills.line}
          />
        </Kpi>
      )}
    </KpiGrid>
  );
}

function PaceCard({ progress }: { progress: BudgetProgress }) {
  const pace = spendingPace(progress);
  if (!pace) return null;
  return (
    <Card as="section" className={cx(styles.wideCard, styles.w2)} aria-labelledby="desk-pace">
      <div className={styles.titled}>
        <h2 id="desk-pace" className="h2">
          Spending pace
        </h2>
        <span className="small muted">Everyday spending</span>
      </div>
      <div className={styles.bigChart}>
        <RunningTotalChart {...pace.chart} ticks={midTick(progress)} height={240} />
      </div>
      {(pace.course || pace.vsLast) && (
        <p className={cx("small sub", styles.note)}>
          {pace.course && (
            <>
              <span className={styles.course}>{pace.course.lead}</span> {pace.course.rest}{" "}
            </>
          )}
          {pace.vsLast}
        </p>
      )}
    </Card>
  );
}

function PlanCard({ progress }: { progress: BudgetProgress }) {
  const lines = progress.lines.filter((line) => line.kind !== "set");
  if (lines.length === 0) return null;
  return (
    <Card as="section" className={cx(styles.planCard, styles.w1)} aria-labelledby="desk-plan">
      <div className={styles.deskHead}>
        <div className={styles.titled}>
          <h2 id="desk-plan" className="h2">
            Plan vs reality
          </h2>
          <span className="small muted">Everyday</span>
        </div>
        <TextLink href="/budgets">All budgets</TextLink>
      </div>
      <ul className={styles.rows}>
        {lines.map((line) => {
          const colour = colourVar(colourOf(line.category));
          return (
            <li key={line.budget.id} className={styles.planRow}>
              <div className={styles.planTop}>
                <span className={styles.key} style={{ background: colour }} aria-hidden="true" />
                <span className={cx("small grow ellipsis", styles.rowName)}>
                  {line.category.name}
                </span>
                <span className="small tnum">
                  {dollars(line.spent)} <span className="muted">of {dollars(line.planned)}</span>
                </span>
              </div>
              <div className={styles.planBottom}>
                <BarMeter
                  className={styles.thinBar}
                  value={line.spent}
                  max={line.planned}
                  today={line.today ?? undefined}
                  colour={colourOf(line.category)}
                  label={`${line.category.name} spent so far`}
                  valueText={`${dollars(line.spent)} of ${dollars(line.planned)}`}
                />
                <StatusWords status={lineStatus(line, false)} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function MonthsCard({ months }: { months: readonly InOutMonth[] }) {
  const last = months.at(-1);
  if (!last) return null;
  const left = last.inCents - last.outCents;
  return (
    <Card as="section" className={cx(styles.wideCard, styles.w2)} aria-labelledby="desk-months">
      <div className={styles.cardHeadWrap}>
        <div className={styles.titled}>
          <h2 id="desk-months" className="h2">
            Money in, money out
          </h2>
          <span className="small muted">
            {months.length === 1 ? "Last month" : `Last ${months.length} months`}
          </span>
        </div>
        <TextLink href="/reports/money-in-out">Open report</TextLink>
      </div>
      <Well className={styles.monthWell}>
        <span className={styles.monthName}>{last.name}</span>
        <span className={cx("small tnum", styles.keyed)}>
          <span className={styles.key} style={{ background: "var(--in)" }} aria-hidden="true" />
          <span className="muted">In</span> {dollars(last.inCents)}
        </span>
        <span className={cx("small tnum", styles.keyed)}>
          <span className={styles.key} style={{ background: "var(--out)" }} aria-hidden="true" />
          <span className="muted">Out</span> {dollars(last.outCents)}
        </span>
        <span className={cx("small tnum", styles.keyed)}>
          <span className={styles.key} style={{ background: "var(--left)" }} aria-hidden="true" />
          <span className="muted">Kept</span> {formatMoney(left, { decimals: "never" })} ·{" "}
          {formatPercent(ratio(left, last.inCents))}
        </span>
      </Well>
      <div className={styles.monthsChart}>
        <InOutBars
          label={`Money in and out, ${months.length === 1 ? "last month" : `last ${months.length} months`}`}
          months={months}
          height={200}
          legend={false}
        />
      </div>
    </Card>
  );
}

function categoryCell(row: ActivityRow) {
  if (row.notCounted) return "Transfer, not counted";
  if (row.parts.length > 0) return partsLine(row).replace(/ · /g, ", ");
  return categoryLabel(row);
}

function LatestTable({ data }: { data: HomeData }) {
  const rows = data.latest.slice(0, DESKTOP_LATEST_ROWS);
  if (rows.length === 0) return null;
  return (
    <Card as="section" className={styles.tableCard} aria-labelledby="desk-latest">
      <div className={styles.deskHead}>
        <div className={styles.titled}>
          <h2 id="desk-latest" className="h2">
            Latest
          </h2>
          <span className="small muted">Everything you can see</span>
        </div>
        <TextLink href="/activity">All activity</TextLink>
      </div>
      <div className={styles.scroll}>
        <div role="table" aria-label="Latest transactions" className={styles.table}>
          <div role="row" className={cx("small muted", styles.cols, styles.colHead)}>
            <span role="columnheader">Date</span>
            <span role="columnheader">What</span>
            <span role="columnheader">Category</span>
            <span role="columnheader">Whose</span>
            <span role="columnheader">Account</span>
            <span role="columnheader" className={styles.num}>
              Amount
            </span>
          </div>
          {rows.map((row) => {
            const whose = whoseLook(row.whose, data.people);
            const first = row.parts[0]?.category ?? row.category;
            const second = row.parts[1]?.category;
            const quiet = row.pending || row.notCounted;
            const tag = row.pending ? "Pending" : row.tags[0]?.name;
            return (
              <div
                role="row"
                key={row.id}
                className={cx(styles.cols, styles.tableRow, row.pending && styles.pendingRow)}
              >
                <span role="cell" className="sub tnum">
                  {whenWords(row.date, data.today)}
                </span>
                <span role="cell" className={styles.what}>
                  <Tile icon={rowIcon(row)} size="sm" className={styles.smallTile} />
                  <span className={cx("ellipsis", styles.rowName)}>{row.shop}</span>
                  {tag && <Tag>{tag}</Tag>}
                </span>
                <span role="cell" className={styles.what}>
                  <span
                    className={styles.key}
                    style={{ background: colourVar(categoryColour(first)) }}
                    aria-hidden="true"
                  />
                  {second && (
                    <span
                      className={cx(styles.key, styles.keyOver)}
                      style={{ background: colourVar(categoryColour(second)) }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="ellipsis sub">{categoryCell(row)}</span>
                </span>
                <span role="cell" className={styles.what}>
                  <Avatar
                    size="sm"
                    owner={whose.owner}
                    initials={whose.initials}
                    label={whose.label}
                  />
                  <span className="sub ellipsis">{whose.label}</span>
                </span>
                <span role="cell" className="sub ellipsis">
                  {row.account.name}
                </span>
                <span role="cell" className={cx("amt", styles.num, quiet && styles.quietAmount)}>
                  {rowAmount(row)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

/**
 * Home on desktop, from the "Desktop: Home" board: the KPI row, the big spending pace chart next to
 * Plan vs reality, the last 12 months of money in and out, and Latest as a table. The numbers are
 * the phone Home's, from the same data. Until payday, net worth and Big buys and trips wait for
 * their projects.
 */
export function DesktopHome({ data }: { data: HomeData }) {
  return (
    <div className={styles.desktop}>
      <Kpis data={data} />
      <div className={styles.flow}>
        <PaceCard progress={data.progress} />
        <PlanCard progress={data.progress} />
      </div>
      <div className={styles.flow}>
        <MonthsCard months={data.months} />
      </div>
      <LatestTable data={data} />
    </div>
  );
}
