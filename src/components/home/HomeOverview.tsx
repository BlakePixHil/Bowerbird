import Link from "next/link";
import { activityHref } from "@/components/activity/show";
import {
  categoryLabel,
  rowAmount,
  rowIcon,
  whoseLook,
  type People,
} from "@/components/activity/look";
import { dollars } from "@/components/budgets/budgets";
import type { Status } from "@/components/budgets/progress";
import { RunningTotalChart, type InOutMonth } from "@/components/charts";
import {
  Avatar,
  BarMeter,
  ButtonLink,
  Card,
  cx,
  Divider,
  Icon,
  Money,
  Pill,
  Tag,
  TextLink,
  Tile,
  Well,
  type IconName,
} from "@/components/ui";
import type { ActivityRow, BudgetProgress, InOut } from "@/lib/access";
import type { PlainDate } from "@/lib/money";
import {
  billsLine,
  fillsInWords,
  inOutCard,
  leftToSpend,
  readyTiles,
  setupSteps,
  spendingPace,
  whenWords,
  type SetupFacts,
} from "./home";
import { DesktopHome } from "./DesktopHome";
import styles from "./Home.module.css";

export type HomeData = {
  today: PlainDate;
  /** Budgets for the period Home shows, the same as on Budgets. */
  progress: BudgetProgress;
  /** Money in and out so far this period, from Activity's totals. */
  money: InOut;
  /** The newest transactions, newest first: the phone shows 5, desktop 10. */
  latest: readonly ActivityRow[];
  /** Money in and out for each whole month before this one, oldest first, for desktop. */
  months: readonly InOutMonth[];
  people: People;
  /** The first-week state: set until there are transactions and budgets to show. */
  setup: SetupFacts | null;
  /** The accounts brought in, with their newest balance, for desktop's first week. */
  accounts: readonly HomeAccount[];
  /** "Blake", for "You're set, Blake". */
  firstName: string;
};

/** One account on desktop's first week: "Everyday Access, Yours · Harbour Bank, $2,184". */
export type HomeAccount = {
  id: string;
  name: string;
  meta: string;
  icon: IconName;
  balanceCents: number | null;
};

/** How many transactions Latest shows on the phone. */
export const LATEST_ROWS = 5;

function StatusPill({ status }: { status: Status }) {
  if (status.tone === "plain")
    return (
      <span className={cx("small sub", styles.plainStatus)}>
        <Icon name={status.icon} size="sm" />
        {status.text}
      </span>
    );
  return (
    <Pill tone={status.tone} icon={status.icon}>
      {status.text}
    </Pill>
  );
}

function LeftToSpendCard({ progress }: { progress: BudgetProgress }) {
  const left = leftToSpend(progress);
  const bills = billsLine(progress);
  const title = left?.title ?? "Left to spend";
  return (
    <Card as="section" className={styles.card} aria-labelledby="home-left">
      <div className={styles.cardTop}>
        <h2 id="home-left" className={cx("eyebrow", styles.eyebrow)}>
          {title}
        </h2>
        {left && <StatusPill status={left.pace} />}
      </div>
      {left ? (
        <>
          <p className={cx("hero tnum", styles.hero)}>{left.hero}</p>
          <p className={cx("sub", styles.lead)}>{left.line}</p>
          <div className={styles.meter}>
            <BarMeter
              size="lg"
              value={left.spent}
              max={left.planned}
              today={left.today}
              label="Everyday spending so far"
              valueText={`${dollars(left.spent)} of ${dollars(left.planned)}`}
            />
            <div className={cx("small", styles.meterFoot)}>
              <span className="sub tnum">{dollars(left.spent)} spent</span>
              <span className="muted">{left.dayLine}</span>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.noEveryday}>
          <p className={cx("sub", styles.lead)}>
            Set budgets for everyday spending, like groceries and eating out, to see what&apos;s
            left to spend and how fast it&apos;s going.
          </p>
          <ButtonLink href="/budgets/plan" icon="pencil">
            Change the plan
          </ButtonLink>
        </div>
      )}
      {bills && (
        <>
          <Divider className={styles.billsRule} />
          <Link href="/budgets" className={styles.bills}>
            <Icon name="bolt" size="sm" className={styles.quietIcon} />
            <span className="small grow tnum">
              <span className="sub">Bills</span> {bills.paid} <span className="muted">·</span>{" "}
              {bills.toCome}
            </span>
            <Icon name="chevron-right" size="sm" className={styles.quietIcon} />
          </Link>
        </>
      )}
    </Card>
  );
}

function SpendingPaceCard({ progress }: { progress: BudgetProgress }) {
  const pace = spendingPace(progress);
  if (!pace) return null;
  return (
    <Card as="section" className={styles.card} aria-labelledby="home-pace">
      <div className={styles.cardHead}>
        <h2 id="home-pace" className="h2">
          Spending pace
        </h2>
        <span className="small muted">Everyday spending</span>
      </div>
      <div className={styles.chart}>
        <RunningTotalChart {...pace.chart} height={132} />
      </div>
      {pace.vsLast && <p className={cx("small sub", styles.note)}>{pace.vsLast}</p>}
    </Card>
  );
}

function InOutCard({ data }: { data: HomeData }) {
  const card = inOutCard(data.money, data.progress.period, data.progress.spec);
  return (
    <Card as="section" className={cx(styles.card, styles.linked)}>
      <div className={styles.cardHead}>
        <h2 className="h2">
          <Link href="/reports/money-in-out" className={styles.stretched}>
            Money in, money out
          </Link>
        </h2>
        <span className="small muted">{card.title}</span>
      </div>
      <div className={styles.inOut}>
        <span className="small sub">In</span>
        <span className={styles.inOutTrack} aria-hidden="true">
          <span className={styles.inBar} style={{ width: `${card.inPct}%` }} />
        </span>
        <span className="amt small">{card.in}</span>
        <span className="small sub">Out</span>
        <span className={styles.inOutTrack} aria-hidden="true">
          <span className={styles.outBar} style={{ width: `${card.outPct}%` }} />
        </span>
        <span className="amt small">{card.out}</span>
      </div>
      <Divider />
      <div className={styles.leftOver}>
        <span className="small sub">What&apos;s left over so far</span>
        <span className={cx("tnum", styles.strong)}>{card.left}</span>
      </div>
    </Card>
  );
}

function Latest({ data, check }: { data: HomeData; check: boolean }) {
  if (data.latest.length === 0) return null;
  return (
    <Card as="section" className={styles.listCard} aria-labelledby="home-latest">
      <div className={styles.listHead}>
        <h2 id="home-latest" className="h2">
          Latest
        </h2>
        <TextLink href="/activity">See all</TextLink>
      </div>
      <ul className={styles.rows}>
        {data.latest.slice(0, LATEST_ROWS).map((row) => {
          const whose = whoseLook(row.whose, data.people);
          const unsure = check && row.category === null && !row.notCounted;
          const name = <span className={cx("ellipsis", styles.rowName)}>{row.shop}</span>;
          return (
            <li key={row.id} className={cx(styles.row, row.pending && styles.pending)}>
              <Tile icon={rowIcon(row)} size="sm" />
              <span className="grow">
                <span className={styles.rowTop}>
                  {unsure ? (
                    <Link href={activityHref("check", "")} className={styles.stretched}>
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                  {row.pending && <Tag>Pending</Tag>}
                  {unsure && (
                    <Pill tone="accent" className={styles.checkPill}>
                      Check
                    </Pill>
                  )}
                </span>
                <span className={cx("small muted ellipsis", styles.block)}>
                  {categoryLabel(row)} · {whenWords(row.date, data.today)}
                </span>
              </span>
              <Avatar size="sm" owner={whose.owner} initials={whose.initials} label={whose.label} />
              <span className={cx("amt", styles.rowAmount)}>{rowAmount(row)}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Home with a plan and transactions to show: "are we okay this month?" in one look. */
function ThisPeriod({ data }: { data: HomeData }) {
  return (
    <>
      <LeftToSpendCard progress={data.progress} />
      <SpendingPaceCard progress={data.progress} />
      <InOutCard data={data} />
      <Latest data={data} check={false} />
    </>
  );
}

function SetupCard({ facts, firstName }: { facts: SetupFacts; firstName: string }) {
  const tiles = readyTiles(facts);
  const steps = setupSteps(facts);
  const firstSteps = steps.filter((step) => step.key === "bring" || step.key === "payday");
  const ready = facts.transactions > 0;
  return (
    <Card as="section" className={styles.card} aria-labelledby="home-setup">
      <div className={styles.cardTop}>
        <span className={cx("eyebrow", styles.eyebrow)}>Setup</span>
        {firstSteps.every((step) => step.done) && <Pill tone="good">All 4 steps done</Pill>}
      </div>
      <h2 id="home-setup" className={cx("h1", styles.setupTitle)}>
        {ready ? `You're set, ${firstName}` : `Welcome, ${firstName}`}
      </h2>
      <p className={cx("sub", styles.lead, styles.tight)}>
        {ready
          ? "Here's what's ready. Budgets and reports fill in as the month goes on."
          : "Bring in your transactions and Home fills in from there."}
      </p>
      {tiles.length > 0 && (
        <ul className={styles.tiles}>
          {tiles.map((tile) => (
            <Well as="li" key={tile.label} className={styles.tile}>
              <span className={cx("small", styles.tileLabel)}>
                <Icon name={tile.icon} size="sm" />
                {tile.label}
              </span>
              <span className="mid tnum">{tile.value}</span>
              <span className={cx("tiny muted", styles.tileDetail)}>{tile.detail}</span>
              {tile.pct !== undefined && (
                <BarMeter
                  value={tile.pct}
                  max={100}
                  colour="accent"
                  label="Transactions sorted"
                  valueText={`${tile.pct}%`}
                  className={styles.tileBar}
                />
              )}
            </Well>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Checklist({ facts }: { facts: SetupFacts }) {
  const steps = setupSteps(facts);
  const done = steps.filter((step) => step.done).length;
  return (
    <Card as="section" className={styles.listCard} aria-labelledby="home-steps">
      <div className={styles.stepsHead}>
        <h2 id="home-steps" className="h2">
          Finish setting up
        </h2>
        <span className="small muted tnum">
          {done} of {steps.length} done
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Setup checklist"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
        className={styles.segments}
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step) => (
          <span key={step.key} className={cx(styles.segment, step.done && styles.segmentOn)} />
        ))}
      </div>
      <ul className={styles.steps}>
        {steps.map((step) => (
          <li key={step.key} className={cx(styles.step, step.done && styles.stepDone)}>
            {step.done ? (
              <span className={cx(styles.check, styles.checkOn)} role="img" aria-label="Done">
                <Icon name="check" size="sm" />
              </span>
            ) : (
              <span className={styles.check} aria-hidden="true" />
            )}
            <span className="grow">
              {step.href ? (
                <Link href={step.href} className={cx(styles.stepTitle, styles.stretched)}>
                  {step.title}
                </Link>
              ) : (
                <span className={styles.stepTitle}>{step.title}</span>
              )}
              <span className={cx("small muted", styles.block)}>{step.detail}</span>
            </span>
            {step.href && <Icon name="chevron-right" size="sm" className={styles.quietIcon} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function FillsIn({ facts }: { facts: SetupFacts }) {
  const words = fillsInWords(facts);
  return (
    <section className={styles.fillsIn} aria-labelledby="home-fills">
      <div className={styles.fillsTop}>
        <Tile icon="bars" size="sm" />
        <div className="grow">
          <h2 id="home-fills" className="h2">
            {words.title}
          </h2>
          <p className={cx("small sub", styles.note, styles.tight)}>{words.line}</p>
        </div>
      </div>
      <div className={styles.ghostLines} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

/** Desktop's first week: each account brought in and its balance, beside the checklist. */
function YourAccounts({ accounts }: { accounts: readonly HomeAccount[] }) {
  return (
    <Card
      as="section"
      className={cx(styles.listCard, styles.accountsCard)}
      aria-labelledby="home-accounts"
    >
      <div className={styles.listHead}>
        <h2 id="home-accounts" className="h2">
          Your accounts
        </h2>
        <TextLink href="/accounts">Who sees what</TextLink>
      </div>
      <ul className={styles.rows}>
        {accounts.map((account) => (
          <li key={account.id} className={styles.row}>
            <Tile icon={account.icon} size="sm" />
            <span className="grow">
              <span className={cx("ellipsis", styles.rowName, styles.block)}>{account.name}</span>
              <span className={cx("small muted ellipsis", styles.block)}>{account.meta}</span>
            </span>
            {account.balanceCents !== null && (
              <Money cents={account.balanceCents} decimals="never" className={styles.rowAmount} />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * Home in the first week, step 4 of the first run: what's ready, what's left to set up, and the
 * newest transactions. Desktop spreads it out as on "Desktop: First run", with the accounts beside
 * the checklist.
 */
function FirstWeek({ data, facts }: { data: HomeData; facts: SetupFacts }) {
  return (
    <>
      <SetupCard facts={facts} firstName={data.firstName} />
      <div className={styles.firstPair}>
        <Checklist facts={facts} />
        {data.accounts.length > 0 && <YourAccounts accounts={data.accounts} />}
      </div>
      <FillsIn facts={facts} />
      <Latest data={data} check />
    </>
  );
}

/**
 * Home, from the "Home" board on the phone and "Desktop: Home" on wider screens: Left to spend,
 * Spending pace, Money in, money out and Latest. Until there are transactions and budgets, it's the
 * first-week state from "First run 4: You are set". Cards for Until payday, net worth, goals and
 * bills coming up wait for their projects.
 */
export function HomeOverview({ data }: { data: HomeData }) {
  if (data.setup)
    return (
      <div className={cx(styles.page, styles.firstWeek)}>
        <FirstWeek data={data} facts={data.setup} />
      </div>
    );
  return (
    <>
      <div className={cx(styles.page, styles.phoneOnly)}>
        <ThisPeriod data={data} />
      </div>
      <DesktopHome data={data} />
    </>
  );
}
