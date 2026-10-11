"use client";

import { useId, useState } from "react";
import {
  Button,
  Chip,
  colourVar,
  cx,
  Icon,
  IconButton,
  SegmentedControl,
  Switch,
  TextField,
  Tile,
  Well,
  type DataColour,
  type IconName,
} from "@/components/ui";
import type { BudgetDraft } from "@/lib/access";
import { specOf } from "@/lib/access/plan";
import {
  BUDGET_PERIODS,
  formatShortDate,
  parseMoney,
  type PayCycle,
  type PlainDate,
} from "@/lib/money";
import {
  aWeekLater,
  alertLines,
  amountText,
  asMonthCents,
  conversionText,
  dollars,
  fromMonthly,
  halfDays,
  KIND_LABELS,
  kindNote,
  kindOf,
  monthlyFrom,
  monthStartDay,
  onDay,
  overWords,
  perWords,
  PERIOD_LABELS,
  QUARTERS_TEXT,
  rolloverNote,
  START_DAYS,
  startWeekday,
  stepFor,
  thisPeriodText,
  weekBased,
  WEEKDAYS,
  withKind,
  withPeriod,
  withWeekday,
  YEAR_STARTS,
  type BudgetKind,
} from "./budgets";
import styles from "./Budgets.module.css";

/** A category a budget is for, with its spending, as the budget screens show it. */
export type PlanCategory = {
  id: string;
  name: string;
  icon: IconName;
  colour: DataColour;
  /** Spent this month so far. */
  thisMonth: number;
  /** Spent last month. */
  lastMonth: number;
  /** The last whole months since money first came in, oldest first. */
  months: number[];
  /** What a whole month usually comes to: the average of `months`. */
  usual: number;
};

type FieldProps = {
  draft: BudgetDraft;
  onChange: (draft: BudgetDraft) => void;
  /** The desktop editor, which is smaller and sits in a well. */
  wide: boolean;
};

const plain = (cents: number) => (cents > 0 ? amountText(cents).slice(1) : "");

/** Amount, with − and + either side of what it's for ("a week"). */
export function AmountField({ draft, onChange, wide, name }: FieldProps & { name: string }) {
  const id = useId();
  const [typed, setTyped] = useState<string | null>(null);
  const step = stepFor(draft.amountCents, wide);
  const set = (amountCents: number) => {
    setTyped(null);
    onChange({ ...draft, amountCents });
  };
  return (
    <div className={styles.fields}>
      <div className="h3" id={id}>
        Amount
      </div>
      <div className={styles.amount}>
        <span className={styles.dollar} aria-hidden="true">
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          aria-labelledby={id}
          aria-describedby={`${id}-per`}
          placeholder="0"
          autoComplete="off"
          value={typed ?? plain(draft.amountCents)}
          onChange={(event) => {
            setTyped(event.target.value);
            const cents = parseMoney(event.target.value);
            onChange({ ...draft, amountCents: cents !== null && cents > 0 ? cents : 0 });
          }}
          onBlur={() => setTyped(null)}
        />
        <span id={`${id}-per`} className={cx("sub small", styles.per)}>
          {perWords(specOf(draft))}
        </span>
        <IconButton
          icon="minus"
          label={`${dollars(step)} less for ${name}`}
          className={styles.step}
          disabled={draft.amountCents <= step}
          onClick={() => set(Math.max(step, draft.amountCents - step))}
        />
        <IconButton
          icon="plus"
          boxed
          label={`${dollars(step)} more for ${name}`}
          className={styles.step}
          onClick={() => set(draft.amountCents + step)}
        />
      </div>
    </div>
  );
}

/** How often, with when it starts, and what it comes to as a month and a year. */
export function HowOften({
  draft,
  onChange,
  wide,
  incomes,
  today,
}: FieldProps & { incomes: readonly PayCycle[]; today: PlainDate }) {
  const spec = specOf(draft);
  return (
    <div className={styles.howOften}>
      <div className="h3">How often</div>
      <div role="group" aria-label="How often" className={styles.chips}>
        {BUDGET_PERIODS.map((period) => (
          <Chip
            key={period}
            on={period === draft.period}
            onClick={() => onChange(withPeriod(draft, period, incomes, today))}
          >
            {PERIOD_LABELS[period]}
          </Chip>
        ))}
      </div>
      {draft.period === "custom" && (
        <div className={styles.dates}>
          <TextField
            label="First day"
            type="date"
            value={draft.periodAnchor ?? ""}
            onChange={(event) => onChange({ ...draft, periodAnchor: event.target.value || null })}
          />
          <TextField
            label="Last day"
            type="date"
            value={draft.periodEnd ?? ""}
            min={draft.periodAnchor ?? undefined}
            onChange={(event) => onChange({ ...draft, periodEnd: event.target.value || null })}
          />
        </div>
      )}
      <Well className={styles.conversion} aria-live="polite">
        <Icon name="swap" size="sm" />
        <span className="tnum">{conversionText(draft.amountCents, spec)}</span>
      </Well>
      <StartsOn draft={draft} onChange={onChange} wide={wide} today={today} />
    </div>
  );
}

function StartsOn({ draft, onChange, today }: FieldProps & { today: PlainDate }) {
  const spec = specOf(draft);
  if (weekBased(draft.period)) {
    const weekday = startWeekday(draft.periodAnchor);
    const current = thisPeriodText(spec, today);
    return (
      <>
        <div className={styles.weekHead}>
          <span className="small sub">Week starts on</span>
          <span className={cx("small", styles.strong)}>
            {WEEKDAYS.find((d) => d.day === weekday)?.name}
          </span>
        </div>
        <div role="group" aria-label="Week starts on" className={styles.days}>
          {WEEKDAYS.map((day) => (
            <button
              key={day.name}
              type="button"
              className={styles.day}
              aria-label={day.name}
              aria-pressed={day.day === weekday}
              onClick={() =>
                onChange({ ...draft, periodAnchor: withWeekday(draft.periodAnchor, day.day) })
              }
            >
              {day.short}
            </button>
          ))}
        </div>
        {current && (
          <div className={cx("small sub", styles.startLine)}>
            <Icon name="calendar" size="sm" />
            <span className="grow">{current}</span>
            <button
              type="button"
              className={styles.link}
              onClick={() => onChange({ ...draft, periodAnchor: aWeekLater(draft.periodAnchor) })}
            >
              Start a week later
            </button>
          </div>
        )}
      </>
    );
  }

  const daySelect = (label: string, value: number, pick: (day: number) => void) => (
    <select
      className={styles.inlineSelect}
      aria-label={label}
      value={String(value)}
      onChange={(event) => pick(Number(event.target.value))}
    >
      {START_DAYS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  let line: React.ReactNode = null;
  switch (draft.period) {
    case "twice_monthly": {
      const [first, second] = halfDays(spec);
      const set = (a: number, b: number) =>
        onChange({ ...draft, periodAnchor: onDay(a), periodSecondDay: b });
      line = (
        <>
          <span>Halves start on the</span>
          {daySelect("First half starts on", first, (day) => set(day, second))}
          <span>and the</span>
          {daySelect("Second half starts on", second, (day) => set(first, day))}
        </>
      );
      break;
    }
    case "monthly":
      line = (
        <>
          <span>Starts on the</span>
          {daySelect("Starts on", monthStartDay(draft.periodAnchor), (day) =>
            onChange({ ...draft, periodAnchor: monthlyFrom(day) }),
          )}
          <span>of each month</span>
        </>
      );
      break;
    case "quarterly":
      line = <span>{QUARTERS_TEXT}</span>;
      break;
    case "yearly": {
      const value = draft.periodAnchor ?? "";
      const known = YEAR_STARTS.some((option) => option.value === value);
      const options = known
        ? YEAR_STARTS
        : [...YEAR_STARTS, { value, label: formatShortDate(value, { weekday: false }) }];
      line = (
        <>
          <span>Starts on</span>
          <select
            className={styles.inlineSelect}
            aria-label="The year starts on"
            value={value}
            onChange={(event) => onChange({ ...draft, periodAnchor: event.target.value || null })}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </>
      );
      break;
    }
    default:
      return null;
  }
  return (
    <div className={cx("small sub", styles.startLine)}>
      <Icon name="calendar" size="sm" />
      {line}
    </div>
  );
}

/** Groceries, last 6 months: a bar for each month against the budget and the average. */
export function History({
  category,
  monthLabels,
  draft,
  onChange,
  wide,
}: FieldProps & { category: PlanCategory; monthLabels: readonly string[] }) {
  const spec = specOf(draft);
  const n = category.months.length;
  if (n > 0 && category.months.every((cents) => cents === 0))
    return (
      <div className={styles.fields}>
        <div className={cx(styles.spread, styles.historyHead)}>
          <span className="h3">
            {wide
              ? `Last ${n} months`
              : `${category.name}, last ${n === 1 ? "month" : `${n} months`}`}
          </span>
        </div>
        <Well className={cx("small sub", styles.empty)}>
          Nothing went on {category.name} in {n === 1 ? "the last month" : `the last ${n} months`},
          so there&apos;s no average to start from.
        </Well>
      </div>
    );
  if (n === 0)
    return (
      <div className={styles.fields}>
        <div className={cx(styles.spread, styles.historyHead)}>
          <span className="h3">{wide ? "Spending so far" : category.name}</span>
        </div>
        <Well className={cx("small sub", styles.empty)}>
          Nothing has come in or gone out here yet, so there&apos;s no average to start from. Set an
          amount and change it once a month or two has gone by.
        </Well>
      </div>
    );

  const labels = monthLabels.slice(-n);
  const budget = asMonthCents(draft.amountCents, spec);
  const average = category.usual;
  const height = 112;
  const top = Math.max(...category.months, budget, average, 1) * 1.12;
  const y = (cents: number) => height - (cents / top) * height;
  // Keep the two labels apart when the lines are close.
  let budgetLabel = y(budget);
  let averageLabel = y(average);
  if (Math.abs(budgetLabel - averageLabel) < 15) {
    const mid = (budgetLabel + averageLabel) / 2;
    const budgetFirst = budgetLabel <= averageLabel;
    budgetLabel = budgetFirst ? mid - 7.5 : mid + 7.5;
    averageLabel = budgetFirst ? mid + 7.5 : mid - 7.5;
  }
  const clamp = (top: number) => Math.min(Math.max(top - 7, -4), height - 12);
  const cols = { "--cols": n } as React.CSSProperties;
  const said = category.months.map((cents, i) => `${labels[i]} ${dollars(cents)}`).join(", ");

  return (
    <div className={styles.fields}>
      <div className={cx(styles.spread, styles.historyHead)}>
        <span className="h3">
          {wide
            ? `Last ${n} months`
            : `${category.name}, last ${n === 1 ? "month" : `${n} months`}`}
        </span>
        <span className="small muted tnum">Average {dollars(average)} a month</span>
      </div>
      <Well className={styles.historyBox}>
        <div
          className={styles.plot}
          role="img"
          aria-label={`${category.name} each month: ${said}. Budget ${dollars(budget)} a month, average ${dollars(average)}.`}
        >
          <div className={styles.bars} style={cols}>
            {category.months.map((cents, i) => (
              <span key={labels[i]} className={styles.barCol}>
                <span
                  className={styles.bar}
                  style={{
                    height: `${(cents / top) * height}px`,
                    background: colourVar(category.colour),
                  }}
                />
              </span>
            ))}
          </div>
          <div className={styles.axis} />
          <div className={styles.lines} aria-hidden="true">
            <span className={styles.averageLine} style={{ top: `${y(average)}px` }} />
            <span style={{ top: `${y(budget)}px` }} />
          </div>
          <span
            className={styles.lab}
            style={{ top: `${clamp(budgetLabel)}px` }}
            aria-hidden="true"
          >
            <span className={styles.keyLine} style={{ background: "var(--text-3)" }} />
            Budget {dollars(budget)}
          </span>
          <span
            className={styles.lab}
            style={{ top: `${clamp(averageLabel)}px` }}
            aria-hidden="true"
          >
            <span className={styles.keyLine} style={{ background: "var(--ghost)" }} />
            Average {dollars(average)}
          </span>
        </div>
        <div className={styles.monthLabels} style={cols} aria-hidden="true">
          {category.months.map((cents, i) => (
            <span key={labels[i]}>
              <span className="mono muted">{labels[i]}</span>
              <span className="tiny tnum sub">{dollars(cents)}</span>
            </span>
          ))}
        </div>
        <div className={cx("small sub", styles.overLine, styles.note)}>
          {overWords(category.months, budget)}
        </div>
      </Well>
      {average > 0 && (
        <Button
          block
          icon="bars"
          className={styles.useAverage}
          onClick={() => onChange({ ...draft, amountCents: fromMonthly(average, spec) })}
        >
          Use my average ({dollars(average)} a month)
        </Button>
      )}
    </div>
  );
}

/** Kind, on desktop: set date, flexible, or rolls over. */
export function KindPicker({ draft, onChange }: Omit<FieldProps, "wide">) {
  const spec = specOf(draft);
  const kind = kindOf(draft);
  const kinds: BudgetKind[] = draft.period === "custom" ? ["set", "flex"] : ["set", "flex", "roll"];
  return (
    <div className={styles.fields}>
      <div className="h3">Kind</div>
      <SegmentedControl
        label="Kind of budget"
        size="sm"
        className={styles.kindSeg}
        options={kinds.map((value) => ({ value, label: KIND_LABELS[value] }))}
        value={kind}
        onChange={(value) => onChange(withKind(draft, value))}
      />
      <div className={cx("small sub", styles.kindNote, styles.note)}>{kindNote(kind, spec)}</div>
    </div>
  );
}

/** Unspent money rolls over, on the phone. */
export function RolloverRow({ draft, onChange }: Omit<FieldProps, "wide">) {
  const custom = draft.period === "custom";
  return (
    <div className={styles.rolloverRow}>
      <div className={styles.switchRow}>
        <div className="grow">
          <div className={styles.strong}>Unspent money rolls over</div>
          <div className={cx("muted small", styles.note)}>
            {rolloverNote(draft.rollover, draft.amountCents, specOf(draft))}
          </div>
        </div>
        <Switch
          checked={draft.rollover && !custom}
          disabled={custom}
          onChange={(event) =>
            onChange(event.target.checked ? withKind(draft, "roll") : { ...draft, rollover: false })
          }
        >
          <span className="sr-only">Unspent money rolls over</span>
        </Switch>
      </div>
    </div>
  );
}

/** Tell me at 80% and at 100%. They're saved now; project 08 sends them. */
export function Alerts({ draft, onChange, wide }: FieldProps) {
  const lines = alertLines(draft.amountCents);
  const rows = [
    { key: "alert80", title: "Tell me at 80%", sub: lines.at80, on: draft.alert80 },
    { key: "alert100", title: "Tell me at 100%", sub: lines.at100, on: draft.alert100 },
  ] as const;
  return (
    <div className={styles.fields}>
      <div className="h3">Alerts</div>
      <div className={styles.alerts}>
        {rows.map((row) => (
          <div key={row.key} className={styles.switchRow}>
            {!wide && <Tile icon="bell-alert" size="sm" />}
            <div className="grow">
              <div className={cx(styles.strong, wide && "small")}>{row.title}</div>
              <div className={cx("muted tnum", wide ? "tiny" : "small")}>{row.sub}</div>
            </div>
            <Switch
              checked={row.on}
              onChange={(event) => onChange({ ...draft, [row.key]: event.target.checked })}
            >
              <span className="sr-only">{row.title}</span>
            </Switch>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The category's tile and name, with what's been spent this month. */
export function SheetHeading({
  category,
  monthName,
}: {
  category: PlanCategory;
  monthName: string;
}) {
  return (
    <div className={styles.sheetHead}>
      <Tile icon={category.icon} className={styles.sheetTile} />
      <div className="grow">
        <div className={styles.sheetName}>
          <span className={styles.key} style={{ background: colourVar(category.colour) }} />
          <span className="ellipsis">{category.name}</span>
        </div>
        <div className="muted small tnum">
          Mine · {dollars(category.thisMonth)} spent so far in {monthName}
        </div>
      </div>
    </div>
  );
}
