import Link from "next/link";
import { ProgressRing } from "@/components/charts";
import { colourOf, iconOf, shareText } from "@/components/categories/look";
import {
  BarMeter,
  ButtonLink,
  Card,
  colourVar,
  cx,
  Divider,
  EmptyState,
  Icon,
  IconButton,
  IconButtonLink,
  Kpi,
  KpiGrid,
  Pill,
  StackedBar,
  Tile,
} from "@/components/ui";
import type { BudgetLine, BudgetProgress, Review } from "@/lib/access";
import { formatMoney, formatShortDate } from "@/lib/money";
import { dollars } from "./budgets";
import {
  averageWords,
  gapStatus,
  goneParts,
  KIND_WORDS,
  kindLine,
  lineStatus,
  outsideWords,
  paceStatus,
  periodLine,
  periodName,
  periodTitle,
  resultStatus,
  type Status,
} from "./progress";
import styles from "./Overview.module.css";

/** Where the page's arrows go: the period before, and after unless it hasn't started. */
export type PeriodLinks = { previous: string | null; next: string | null };

const signed = (cents: number) => formatMoney(cents, { decimals: "never" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const editHref = (line: BudgetLine) => `/budgets/plan?edit=${line.category.id}`;
const capital = (words: string) => words[0].toUpperCase() + words.slice(1);
const fraction = (part: number, whole: number) => (whole > 0 ? Math.min(1, part / whole) : 0);

function StatusLine({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={cx(styles.status, styles[status.tone], className)}>
      <Icon name={status.icon} size="sm" />
      <span>{status.text}</span>
    </span>
  );
}

function StatusPill({ status }: { status: Status }) {
  return status.tone === "plain" ? (
    <StatusLine status={status} />
  ) : (
    <Pill tone={status.tone} icon={status.icon}>
      {status.text}
    </Pill>
  );
}

/** The header's pace: everyday spending against today, or for a period that's over, the result. */
function headStatus(progress: BudgetProgress): Status {
  return progress.day
    ? paceStatus(progress.pace, false)
    : resultStatus(progress.total.planned, progress.total.spent);
}

/** The previous and next period, and which one this is. */
function PeriodNav({
  progress,
  links,
  compact = false,
}: {
  progress: BudgetProgress;
  links: PeriodLinks;
  compact?: boolean;
}) {
  const title = periodTitle(progress.period);
  const arrow = (side: "previous" | "next") => {
    const href = links[side];
    const to = side === "previous" ? progress.previous : progress.next;
    const icon = side === "previous" ? "chevron-left" : "chevron-right";
    const word = side === "previous" ? "Previous" : "Next";
    return href && to ? (
      <IconButtonLink
        boxed
        icon={icon}
        label={`${word}, ${periodTitle(to)}`}
        href={href}
        className={styles.navButton}
      />
    ) : (
      <IconButton
        boxed
        icon={icon}
        label={side === "previous" ? "Previous, no earlier periods" : "Next, not started yet"}
        disabled
        className={styles.navButton}
      />
    );
  };
  const back = arrow("previous");
  const next = arrow("next");
  if (compact)
    return (
      <div role="group" aria-label="Budget period" className={styles.navInline}>
        {back}
        <span className={cx("tnum", styles.navTitle)}>{title}</span>
        {next}
      </div>
    );
  return (
    <div role="group" aria-label="Budget period" className={styles.navRow}>
      {back}
      <div className={styles.navCentre}>
        <div className={styles.navTitle}>{title}</div>
        <div className="muted small">{periodLine(progress)}</div>
      </div>
      {next}
    </div>
  );
}

/** Desktop header: the period's arrows and Change the plan. */
export function BudgetsHeadActions({
  progress,
  links,
}: {
  progress: BudgetProgress;
  links: PeriodLinks;
}) {
  return (
    <div className={styles.headActions}>
      <PeriodNav progress={progress} links={links} compact />
      <ButtonLink href="/budgets/plan" variant="primary" icon="pencil">
        Change the plan
      </ButtonLink>
    </div>
  );
}

function Ring({ progress, size }: { progress: BudgetProgress; size: 140 | 184 }) {
  const { planned, spent, expected } = progress.total;
  const left = planned - spent;
  const current = progress.day !== null;
  return (
    <ProgressRing
      fraction={fraction(spent, planned)}
      expected={current ? fraction(expected, planned) : undefined}
      size={size}
      stroke={size === 184 ? 14 : 12}
      label={`Spent ${dollars(spent)} of ${dollars(planned)}.${current ? ` Expected by today ${dollars(expected)}.` : ""}`}
    >
      <span className={cx(size === 184 ? "big" : "mid", "tnum")}>{dollars(Math.abs(left))}</span>
      <span className={cx("muted tnum", size === 184 ? "small" : "tiny")}>
        {left < 0 ? "over" : size === 184 ? `left of ${dollars(planned)}` : "left"}
      </span>
    </ProgressRing>
  );
}

function Numbers({ progress }: { progress: BudgetProgress }) {
  const { planned, spent, expected } = progress.total;
  return (
    <div className={cx("small", styles.numbers)}>
      <span className={cx("sub", styles.keyed)}>
        <span className={styles.key} style={{ background: "var(--neg)" }} />
        Spent
      </span>
      <span className="tnum">{dollars(spent)}</span>
      {progress.day && (
        <>
          <span className={cx("sub", styles.keyed)}>
            <span className={styles.tickKey} />
            Expected by today
          </span>
          <span className="tnum">{dollars(expected)}</span>
        </>
      )}
      <span className={cx("sub", styles.keyed)}>
        <span className={cx(styles.key, styles.trackKey)} />
        Planned
      </span>
      <span className="tnum">{dollars(planned)}</span>
    </div>
  );
}

const TICK_NOTE =
  "The tick is where you'd expect to be today, allowing for bills that come out on set dates. Pace counts everyday spending only, so a bill paid early doesn't put you over.";

function SoFar({ progress, wide }: { progress: BudgetProgress; wide: boolean }) {
  return (
    <>
      <div className={styles.ringRow}>
        <Ring progress={progress} size={wide ? 184 : 140} />
        <div className={styles.ringSide}>
          <StatusPill status={headStatus(progress)} />
          <Numbers progress={progress} />
        </div>
      </div>
      {progress.day && (
        <p className={cx("muted", wide ? "small" : "tiny", styles.note)}>{TICK_NOTE}</p>
      )}
    </>
  );
}

function Gone({ progress, wide }: { progress: BudgetProgress; wide: boolean }) {
  const parts = goneParts(progress.lines);
  const spent = progress.total.spent;
  const outside = outsideWords(progress.outside);
  if (parts.length === 0)
    return (
      <p className={cx("small sub", styles.note)}>
        {progress.day ? "Nothing spent on your budgets yet." : "Nothing was spent on your budgets."}
        {outside ? ` ${outside}` : ""}
      </p>
    );
  return (
    <>
      <StackedBar
        label="Where it's gone"
        parts={parts.map((part) => ({ label: part.label, value: part.cents, colour: part.colour }))}
        formatValue={dollars}
        height={wide ? 16 : 12}
      />
      <ul className={cx(styles.goneList, wide && styles.goneWide)}>
        {parts.map((part) => (
          <li key={part.label} className="small">
            <span className={styles.key} style={{ background: colourVar(part.colour) }} />
            <span className="sub ellipsis grow">{part.label}</span>
            <span className={cx("tnum", wide && styles.strong)}>{dollars(part.cents)}</span>
            {wide && (
              <span className={cx("muted tnum", styles.share)}>{shareText(part.cents, spent)}</span>
            )}
          </li>
        ))}
      </ul>
      {outside && <p className={cx("small muted", styles.note)}>{outside}</p>}
    </>
  );
}

/** Bills on set dates and everyday spending, each against its share of the plan. */
function Kinds({ progress }: { progress: BudgetProgress }) {
  const bills = progress.lines.filter((line) => line.kind === "set");
  const everyday = progress.lines.length - bills.length;
  const { setDates, everyday: daily } = progress;
  const kinds = [
    bills.length > 0 && {
      label: "Bills on set dates",
      totals: setDates,
      tick: undefined,
      sub: progress.day
        ? `${bills.map((line) => line.category.name).join(", ")} · ${dollars(Math.max(0, setDates.planned - setDates.spent))} still to come`
        : bills.map((line) => line.category.name).join(", "),
    },
    everyday > 0 && {
      label: "Everyday spending",
      totals: daily,
      tick: progress.day ? fraction(daily.expected, daily.planned) : undefined,
      sub: progress.day
        ? `The other ${plural(everyday, "budget")} · the tick is today, day ${progress.day.day} of ${progress.day.of}`
        : `${plural(everyday, "budget")}`,
    },
  ].filter((kind) => kind !== false);
  if (kinds.length === 0) return null;
  return (
    <div className={styles.kinds}>
      {kinds.map((kind) => (
        <div key={kind.label}>
          <div className={cx("small", styles.kindHead)}>
            <span className={cx("grow", styles.strong)}>{kind.label}</span>
            <span className="tnum">
              <span className={styles.bold}>{dollars(kind.totals.spent)}</span>{" "}
              <span className="muted">of {dollars(kind.totals.planned)}</span>
            </span>
          </div>
          <BarMeter
            value={kind.totals.spent}
            max={kind.totals.planned}
            today={kind.tick}
            label={`${kind.label} spent`}
            valueText={`${dollars(kind.totals.spent)} of ${dollars(kind.totals.planned)}`}
            className={styles.kindBar}
          />
          <div className={cx("tiny muted tnum", styles.kindSub)}>{kind.sub}</div>
        </div>
      ))}
    </div>
  );
}

/** Desktop: the four headline numbers from the board. */
function Headline({ progress }: { progress: BudgetProgress }) {
  const { total, setDates, everyday, day } = progress;
  const name = periodName(progress.period, progress.spec, day === null);
  const left = total.planned - total.spent;
  return (
    <KpiGrid className={styles.kpis}>
      <Kpi
        label="Planned"
        value={dollars(total.planned)}
        detail={`${plural(progress.lines.length, "budget")} for ${name}`}
      >
        <span className="tiny muted tnum">
          {dollars(setDates.planned)} on set dates · {dollars(everyday.planned)} everyday
        </span>
      </Kpi>
      <Kpi
        label="Spent"
        value={dollars(total.spent)}
        detail={`${Math.round(fraction(total.spent, total.planned) * 100)}% of the plan`}
      >
        <BarMeter
          value={total.spent}
          max={total.planned}
          today={day ? fraction(total.expected, total.planned) : undefined}
          label="Spent of the plan"
          valueText={`${dollars(total.spent)} of ${dollars(total.planned)}`}
        />
      </Kpi>
      {day ? (
        <Kpi
          label="Expected by today"
          value={dollars(total.expected)}
          detail={<StatusPill status={headStatus(progress)} />}
        >
          <span className="tiny muted">Allowing for bills that come out on set dates</span>
        </Kpi>
      ) : (
        <Kpi
          label="Everyday spending"
          value={dollars(everyday.spent)}
          detail={<StatusPill status={resultStatus(everyday.planned, everyday.spent)} />}
        >
          <span className="tiny muted tnum">
            Of {dollars(everyday.planned)} planned, bills left out
          </span>
        </Kpi>
      )}
      <Kpi
        label={left < 0 ? "Over" : "Left"}
        value={dollars(Math.abs(left))}
        detail={
          day
            ? `${dollars(Math.max(0, setDates.planned - setDates.spent))} for bills still to come`
            : `Ended ${formatShortDate(progress.period.end)}`
        }
      >
        {day && (
          <span className="tiny muted tnum">
            {dollars(Math.max(0, everyday.planned - everyday.spent))} for everyday,{" "}
            {plural(day.of - day.day, "day")} to go
          </span>
        )}
      </Kpi>
    </KpiGrid>
  );
}

/** Desktop: every budget in a row, from the board's table. Each opens it on Change the plan. */
function BudgetTable({ progress }: { progress: BudgetProgress }) {
  const { total, day, lines } = progress;
  const finished = day === null;
  const status = headStatus(progress);
  return (
    <Card as="section" aria-labelledby="each-budget" className={styles.tableCard}>
      <div className={styles.tableHead}>
        <div className={styles.titled}>
          <h2 id="each-budget" className="h2">
            Each budget
          </h2>
          <span className="muted small">
            {lines.length === 1 ? "Your budget" : `All ${lines.length} budgets`}, spent of planned
          </span>
        </div>
        {!finished && (
          <span className={cx("small sub", styles.keyed)}>
            <span className={styles.tickKey} />
            Where you&apos;d expect to be today
          </span>
        )}
      </div>
      <div className={styles.scroll}>
        <div className={styles.table}>
          <div className={cx("small muted", styles.cols, styles.colHead)} aria-hidden="true">
            <span>Budget</span>
            <span>How often</span>
            <span className={styles.num}>Plan</span>
            <span className={styles.num}>Spent</span>
            <span className={styles.num}>Left</span>
            <span>Progress</span>
            <span>How it&apos;s going</span>
          </div>
          {lines.map((line) => (
            <Link
              key={line.budget.id}
              href={editHref(line)}
              className={cx(styles.cols, styles.row)}
            >
              <span className={styles.cell}>
                <span className={styles.nameLine}>
                  <span
                    className={styles.key}
                    style={{ background: colourVar(colourOf(line.category)) }}
                  />
                  <span className={cx("ellipsis", styles.strong)}>{line.category.name}</span>
                </span>
                <span className={cx("tiny muted", styles.kindWord)}>{KIND_WORDS[line.kind]}</span>
              </span>
              <span className={cx("sub small", styles.cell, styles.pretty)}>
                {kindLine(line, progress.spec)}
              </span>
              <span className={cx("tnum", styles.num)}>{dollars(line.planned)}</span>
              <span className={cx("tnum", styles.num, styles.strong)}>{dollars(line.spent)}</span>
              <span className={cx("tnum", styles.num)}>{signed(line.planned - line.spent)}</span>
              <span className={styles.cell}>
                <BarMeter
                  value={line.spent}
                  max={line.planned}
                  colour={colourOf(line.category)}
                  today={finished || line.today === null ? undefined : line.today}
                  label={`${line.category.name} spent`}
                  valueText={`${dollars(line.spent)} of ${dollars(line.planned)}`}
                />
              </span>
              <StatusLine status={lineStatus(line, finished)} className={styles.cell} />
            </Link>
          ))}
          <div className={cx(styles.cols, styles.totalRow)}>
            <span>{lines.length === 1 ? "The budget" : `All ${lines.length} budgets`}</span>
            <span className={cx("sub small", styles.light)}>{periodLine(progress)}</span>
            <span className={cx("tnum", styles.num)}>{dollars(total.planned)}</span>
            <span className={cx("tnum", styles.num)}>{dollars(total.spent)}</span>
            <span className={cx("tnum", styles.num)}>{signed(total.planned - total.spent)}</span>
            <span>
              <BarMeter
                value={total.spent}
                max={total.planned}
                today={finished ? undefined : fraction(total.expected, total.planned)}
                label="All budgets spent"
                valueText={`${dollars(total.spent)} of ${dollars(total.planned)}`}
              />
            </span>
            <StatusLine status={status} />
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Phones: each budget as a card row, from the "Budgets: plan vs reality" board. */
function BudgetList({ progress }: { progress: BudgetProgress }) {
  const finished = progress.day === null;
  return (
    <section aria-labelledby="each-budget-phone" className={styles.page}>
      <div className={styles.sectionHead}>
        <h2 id="each-budget-phone" className="h2">
          Each budget
        </h2>
        <span className="muted small">Spent of planned</span>
      </div>
      <Card className={styles.phoneCard}>
        {progress.lines.map((line) => (
          <Link key={line.budget.id} href={editHref(line)} className={styles.phoneRow}>
            <span className={styles.phoneTop}>
              <Tile icon={iconOf(line.category)} size="sm" />
              <span className="grow">
                <span className={cx("ellipsis", styles.phoneName)}>{line.category.name}</span>
                <span className={cx("tiny muted", styles.block)}>
                  {kindLine(line, progress.spec)}
                </span>
              </span>
              <span className={styles.phoneAmount}>
                <span className={cx("tnum", styles.bold)}>{dollars(line.spent)}</span>
                <span className="tiny muted tnum">of {dollars(line.planned)}</span>
              </span>
            </span>
            <BarMeter
              value={line.spent}
              max={line.planned}
              colour={colourOf(line.category)}
              today={finished || line.today === null ? undefined : line.today}
              size="lg"
              label={`${line.category.name} spent`}
              valueText={`${dollars(line.spent)} of ${dollars(line.planned)}`}
            />
            <StatusLine status={lineStatus(line, finished)} className="small" />
          </Link>
        ))}
      </Card>
    </section>
  );
}

/** Plan vs reality: the period before, by budget, against the plan and the usual. */
function PlanVsReality({ progress }: { progress: BudgetProgress }) {
  const review = progress.review;
  if (!review || review.rows.length === 0)
    return (
      <EmptyState icon="target" title="Plan vs reality">
        {review
          ? "None of your budgets ran last period, so there's nothing to compare yet."
          : "After your first full period, this compares what you spent in each category with what you planned."}
      </EmptyState>
    );
  return <ReviewCard review={review} progress={progress} />;
}

function ReviewCard({ review, progress }: { review: Review; progress: BudgetProgress }) {
  const title = periodTitle(review.period);
  const usual = averageWords(review, progress.spec);
  return (
    <Card as="section" aria-labelledby="plan-vs-reality-title" className={styles.tableCard}>
      <div className={styles.tableHead}>
        <div className={styles.titled}>
          <h2 id="plan-vs-reality-title" className="h2">
            Plan vs reality
          </h2>
          <span className="muted small">{title}, biggest gaps first</span>
        </div>
        <span className={cx("small sub", styles.keyed, styles.wideOnly)}>
          <span className={styles.tickKey} />
          The plan
        </span>
      </div>

      <div className={cx(styles.scroll, styles.wideOnly)}>
        <div className={cx(styles.table, styles.reviewTable)}>
          <div className={cx("small muted", styles.reviewCols, styles.colHead)} aria-hidden="true">
            <span>Budget</span>
            <span className={styles.num}>Planned</span>
            <span className={styles.num}>Spent</span>
            <span>Difference</span>
            <span className={styles.num}>Usually</span>
            <span>Spent against the plan</span>
          </div>
          {review.rows.map(({ line, gap, average }) => {
            const most = Math.max(line.planned, line.spent, average ?? 0);
            return (
              <div key={line.budget.id} className={cx(styles.reviewCols, styles.row)}>
                <span className={styles.cell}>
                  <span className={styles.nameLine}>
                    <span
                      className={styles.key}
                      style={{ background: colourVar(colourOf(line.category)) }}
                    />
                    <span className={cx("ellipsis", styles.strong)}>{line.category.name}</span>
                  </span>
                  <span className={cx("tiny muted", styles.kindWord)}>{KIND_WORDS[line.kind]}</span>
                </span>
                <span className={cx("tnum", styles.num)}>{dollars(line.planned)}</span>
                <span className={cx("tnum", styles.num, styles.strong)}>{dollars(line.spent)}</span>
                <StatusLine status={gapStatus(gap)} />
                <span className={cx("tnum", styles.num)}>
                  {average === null ? "–" : dollars(average)}
                </span>
                <span className={styles.cell}>
                  <BarMeter
                    value={line.spent}
                    max={most}
                    today={most > 0 ? line.planned / most : undefined}
                    colour={colourOf(line.category)}
                    label={`${line.category.name} spent against the plan`}
                    valueText={`${dollars(line.spent)} spent, ${dollars(line.planned)} planned`}
                  />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <ul className={cx(styles.reviewList, styles.phoneOnlyBlock)}>
        {review.rows.map(({ line, gap, average }) => (
          <li key={line.budget.id} className={styles.reviewItem}>
            <span className={styles.reviewTop}>
              <span
                className={styles.key}
                style={{ background: colourVar(colourOf(line.category)) }}
              />
              <span className={cx("grow ellipsis", styles.strong)}>{line.category.name}</span>
              <span className="tnum small">
                <span className={styles.bold}>{dollars(line.spent)}</span>{" "}
                <span className="muted">of {dollars(line.planned)}</span>
              </span>
            </span>
            <span className={cx("small", styles.reviewSub)}>
              <StatusLine status={gapStatus(gap)} />
              {average !== null && <span className="muted tnum">Usually {dollars(average)}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className={cx("small muted", styles.foot)}>
        Planned is today&apos;s plan, since earlier amounts aren&apos;t kept. {usual}
      </p>
    </Card>
  );
}

/** Budgets: the period's pace, each budget, and how the period before went. */
export function BudgetsOverview({
  progress,
  links,
}: {
  progress: BudgetProgress;
  links: PeriodLinks;
}) {
  const nothing = progress.lines.length === 0;
  return (
    <div className={styles.page}>
      <div className={styles.phoneOnly}>
        <PeriodNav progress={progress} links={links} />
      </div>
      {nothing ? (
        <EmptyState
          icon="pie"
          title="Set your budgets"
          action={
            <ButtonLink href="/budgets/plan" variant="primary" icon="plus">
              Set a budget
            </ButtonLink>
          }
        >
          Set an amount for the things you spend on, for each pay cycle or month, and see whether
          you&apos;re on pace as it goes.
        </EmptyState>
      ) : (
        <>
          <div className={cx(styles.page, styles.wideOnly)}>
            <Headline progress={progress} />
            <div className={styles.flow}>
              <Card as="section" aria-labelledby="so-far" className={styles.card}>
                <div className={styles.cardHead}>
                  <h2 id="so-far" className="h2">
                    {progress.day
                      ? `${capital(periodName(progress.period, progress.spec, false))} so far`
                      : periodTitle(progress.period)}
                  </h2>
                  <span className="muted small">{periodLine(progress)}</span>
                </div>
                <SoFar progress={progress} wide />
              </Card>
              <Card as="section" aria-labelledby="gone" className={styles.card}>
                <div className={styles.cardHead}>
                  <div className={styles.titled}>
                    <h2 id="gone" className="h2">
                      Where it&apos;s gone
                    </h2>
                    <span className="muted small tnum">{dollars(progress.total.spent)} spent</span>
                  </div>
                </div>
                <Gone progress={progress} wide />
                <Divider />
                <Kinds progress={progress} />
              </Card>
            </div>
            <BudgetTable progress={progress} />
          </div>

          <div className={cx(styles.page, styles.phoneOnly)}>
            <Card as="section" aria-label="This period so far" className={styles.card}>
              <SoFar progress={progress} wide={false} />
              <Divider />
              <h2 className="h3">Where it&apos;s gone</h2>
              <Gone progress={progress} wide={false} />
            </Card>
            <BudgetList progress={progress} />
          </div>
        </>
      )}
      <div id="plan-vs-reality" className={styles.anchor}>
        {nothing ? (
          <EmptyState icon="target" title="Plan vs reality">
            After your first full period, this compares what you spent in each category with what
            you planned.
          </EmptyState>
        ) : (
          <PlanVsReality progress={progress} />
        )}
      </div>
    </div>
  );
}
