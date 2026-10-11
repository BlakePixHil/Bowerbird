import { DailyBars } from "@/components/charts";
import { Card, cx, Pill } from "@/components/ui";
import { againstUsual, formatMoney, type PlainDate, type WeekSpending } from "@/lib/money";
import styles from "./Activity.module.css";

const dollars = (cents: number) => formatMoney(cents, { decimals: "never" });

/** The comparison with a usual week, such as "$74 more than usual". */
function UsualPill({ week, usualWeek }: { week: number; usualWeek: number }) {
  const against = againstUsual(week, usualWeek);
  if (against.kind === "about")
    return (
      <Pill tone="quiet" icon="dash">
        About usual
      </Pill>
    );
  return against.kind === "more" ? (
    <Pill tone="warn" icon="arrow-up-right">
      {dollars(against.cents)} more than usual
    </Pill>
  ) : (
    <Pill tone="good" icon="arrow-down-right">
      {dollars(against.cents)} less than usual
    </Pill>
  );
}

/**
 * "Spent this week" at the top of Activity: today and the six days before, against a usual week,
 * with the last two weeks day by day and a line for a typical day.
 */
export function WeekSummary({ spending, today }: { spending: WeekSpending; today: PlainDate }) {
  const { week, lastWeek, usualWeek, usualDay, fortnight } = spending;
  return (
    <Card as="section" aria-labelledby="week-title" className={styles.summary}>
      <div className={styles.summaryText}>
        <div className={styles.summaryTop}>
          <div className={styles.summaryFigure}>
            <h2 id="week-title" className="eyebrow">
              Spent this week
            </h2>
            <span className="big tnum">{dollars(week)}</span>
          </div>
          {usualWeek !== null && <UsualPill week={week} usualWeek={usualWeek} />}
        </div>
        <p className={cx("small muted tnum", styles.summaryNote)}>
          Last week {dollars(lastWeek)}
          {usualDay !== null && ` · a usual day ${dollars(usualDay)}`}
        </p>
      </div>
      <div className={styles.summaryChart}>
        <DailyBars
          label="Spending, last two weeks"
          days={fortnight}
          today={today}
          typical={
            usualDay !== null
              ? { cents: usualDay, label: `Typical day ${dollars(usualDay)}` }
              : undefined
          }
        />
      </div>
    </Card>
  );
}
