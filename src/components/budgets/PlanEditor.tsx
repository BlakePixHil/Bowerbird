"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  BottomSheet,
  Button,
  Card,
  colourVar,
  cx,
  Icon,
  IconButton,
  Pill,
  TextLink,
  Well,
  WIDE,
} from "@/components/ui";
import type { Budget, BudgetDraft, BudgetsRun } from "@/lib/access";
import { budgetProblem, specOf, tidyBudget } from "@/lib/access/plan";
import type { PayCycle, PlainDate } from "@/lib/money";
import { saveBudgets } from "./actions";
import {
  Alerts,
  AmountField,
  History,
  HowOften,
  KindPicker,
  RolloverRow,
  SheetHeading,
  type PlanCategory,
} from "./BudgetFields";
import {
  amountText,
  asMonthCents,
  dollars,
  fromMonthly,
  KIND_LABELS,
  kindOf,
  newBudget,
  perWords,
  PERIOD_LABELS,
  planTotals,
  removeWords,
  sameBudget,
  startingWords,
  type BudgetKind,
} from "./budgets";
import styles from "./Budgets.module.css";

/** Where "Typical money in" comes from: the person's pay, or what came in lately. */
export type MoneyIn = { cents: number; from: "pay" | "average"; months: number };

type PlanData = {
  today: PlainDate;
  /** "October": this month, for "spent so far in October". */
  monthName: string;
  /** "September". */
  lastMonthName: string;
  /** "APR" to "SEP": the last whole months, oldest first. */
  monthLabels: string[];
  /** Every category a budget can be for, in the household's order. */
  categories: PlanCategory[];
  budgets: Budget[];
  moneyIn: MoneyIn | null;
  budgetsRun: BudgetsRun;
  incomes: PayCycle[];
  /** A category whose budget opens straight away, when Budgets sent the person here to change it. */
  editing?: string | null;
};

type Flash = { text: string; undo: { rows: BudgetDraft[]; open: string | null } | null };

type Plan = PlanData & {
  /** The budgets as saved, kept up to date after each save. */
  saved: Budget[];
  /** The budgets on the desktop table, saved or not. */
  rows: BudgetDraft[];
  open: string | null;
  adding: boolean;
  flash: Flash | null;
  setRow: (draft: BudgetDraft) => void;
  setOpen: (categoryId: string | null) => void;
  setAdding: (adding: boolean) => void;
  copyLast: () => void;
  add: (category: PlanCategory) => void;
  remove: (categoryId: string) => void;
  undo: () => void;
  /** After a save, from either the sheet or the table. */
  savedAs: (budgets: Budget[], flash: string) => void;
  discard: () => void;
  categoryOf: (id: string) => PlanCategory | undefined;
  spare: PlanCategory[];
};

const PlanContext = createContext<Plan | null>(null);

function usePlan(): Plan {
  const plan = useContext(PlanContext);
  if (!plan) throw new Error("usePlan needs a PlanProvider");
  return plan;
}

const failed = "Couldn't save that. Check your connection and try again.";

const toDraft = (budget: Budget): BudgetDraft => ({
  id: budget.id,
  categoryId: budget.categoryId,
  amountCents: budget.amountCents,
  period: budget.period,
  periodAnchor: budget.periodAnchor,
  periodEnd: budget.periodEnd,
  periodSecondDay: budget.periodSecondDay,
  rollover: budget.rollover,
  onSetDates: budget.onSetDates,
  alert80: budget.alert80,
  alert100: budget.alert100,
});

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What's changed since the last save: budgets to save, and saved ones to remove. */
function changesOf(rows: readonly BudgetDraft[], saved: readonly Budget[]) {
  const before = new Map(saved.map((budget) => [budget.categoryId, budget]));
  const changed = rows.filter((row) => {
    const was = before.get(row.categoryId);
    return !was || !sameBudget(tidyBudget(row), was);
  });
  const kept = new Set(rows.map((row) => row.categoryId));
  const removed = saved.filter((budget) => !kept.has(budget.categoryId)).map((b) => b.id);
  return { changed, removed, count: changed.length + removed.length };
}

/**
 * Holds Change the plan's state, so the buttons in the page header and the page below share it.
 */
export function PlanProvider({ children, ...data }: PlanData & { children: ReactNode }) {
  const [saved, setSaved] = useState(data.budgets);
  const [basis, setBasis] = useState(data.budgets);
  const [rows, setRows] = useState(() => data.budgets.map(toDraft));
  const [open, setOpen] = useState<string | null>(() =>
    data.budgets.some((budget) => budget.categoryId === data.editing) ? data.editing! : null,
  );
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);

  // New budgets from the server (after a save elsewhere) replace the table, unless it has changes.
  if (basis !== data.budgets) {
    setBasis(data.budgets);
    setSaved(data.budgets);
    if (changesOf(rows, saved).count === 0) setRows(data.budgets.map(toDraft));
  }

  const categoryOf = (id: string) => data.categories.find((category) => category.id === id);
  const has = new Set(rows.map((row) => row.categoryId));
  const spare = data.categories.filter((category) => !has.has(category.id));
  const snapshot = () => ({ rows, open });

  const plan: Plan = {
    ...data,
    saved,
    rows,
    open,
    adding,
    flash,
    categoryOf,
    spare,
    setRow: (draft) =>
      setRows((list) => list.map((row) => (row.categoryId === draft.categoryId ? draft : row))),
    setOpen,
    setAdding,
    copyLast: () => {
      const rises: [string, number][] = [];
      let copied = 0;
      const next = rows.map((row) => {
        const category = categoryOf(row.categoryId);
        if (!category || category.lastMonth <= 0) return row;
        copied += 1;
        const spec = specOf(row);
        const amountCents = fromMonthly(category.lastMonth, spec);
        const rise = asMonthCents(amountCents, spec) - asMonthCents(row.amountCents, spec);
        if (rise > 0) rises.push([category.name, rise]);
        return { ...row, amountCents };
      });
      if (copied === 0) {
        setFlash({
          text: `Nothing was spent in these categories in ${data.lastMonthName}.`,
          undo: null,
        });
        return;
      }
      rises.sort((a, b) => b[1] - a[1]);
      const most = rises
        .slice(0, 2)
        .map(([name, rise]) => `${name} +${dollars(rise)}`)
        .join(", ");
      setFlash({
        text: `Copied ${data.lastMonthName}'s actuals into ${copied === rows.length ? `all ${plural(copied, "budget")}` : plural(copied, "budget")}.${most ? ` Biggest rises: ${most}.` : ""}`,
        undo: snapshot(),
      });
      setRows(next);
    },
    add: (category) => {
      const draft = newBudget(category, data.budgetsRun, data.incomes);
      setFlash({
        text: `Added ${category.name} at ${amountText(draft.amountCents)} ${perWords(specOf(draft))}. Change it below.`,
        undo: snapshot(),
      });
      setRows([...rows, draft]);
      setOpen(category.id);
      setAdding(false);
    },
    remove: (categoryId) => {
      const name = categoryOf(categoryId)?.name ?? "this";
      setFlash({
        text: `Removed the ${name} budget. Its spending stays sorted as ${name}.`,
        undo: snapshot(),
      });
      setRows(rows.filter((row) => row.categoryId !== categoryId));
      setOpen(null);
    },
    undo: () => {
      if (flash?.undo) {
        setRows(flash.undo.rows);
        setOpen(flash.undo.open);
      }
      setFlash(null);
    },
    savedAs: (budgets, text) => {
      setSaved(budgets);
      setRows(budgets.map(toDraft));
      setOpen(null);
      setFlash({ text, undo: null });
    },
    discard: () => {
      setRows(saved.map(toDraft));
      setOpen(null);
      setFlash(null);
    },
  };
  return <PlanContext.Provider value={plan}>{children}</PlanContext.Provider>;
}

/** Copy last month's actuals and Add a budget, in the desktop page header. */
export function PlanActions() {
  const plan = usePlan();
  return (
    <div className={styles.headActions}>
      <Button icon="copy" onClick={plan.copyLast} disabled={plan.rows.length === 0}>
        Copy last month&apos;s actuals
      </Button>
      <Button
        variant="primary"
        icon="plus"
        aria-expanded={plan.adding}
        onClick={() => plan.setAdding(!plan.adding)}
      >
        Add a budget
      </Button>
    </div>
  );
}

/** Change the plan: the plan against money in, then every budget. */
export function PlanEditor() {
  const plan = usePlan();
  return (
    <div className={styles.page}>
      <div className={cx(styles.page, styles.wideOnly)}>
        {plan.adding && <AddBudget />}
        <PlanCard rows={plan.rows} />
        {plan.flash && <FlashLine />}
        <PlanTable />
        <FootBar />
      </div>
      <div className={cx(styles.page, styles.phoneOnly)}>
        <PhonePlan />
      </div>
    </div>
  );
}

function AddBudget() {
  const plan = usePlan();
  return (
    <Card as="section" aria-label="Add a budget" className={styles.addCard}>
      <div className={styles.addHead}>
        <div className={styles.titled}>
          <h2 className="h2">Add a budget</h2>
          <span className="muted small">Categories that don&apos;t have one yet</span>
        </div>
        <IconButton
          icon="close"
          label="Close"
          className={styles.closeSmall}
          onClick={() => plan.setAdding(false)}
        />
      </div>
      {plan.spare.length > 0 ? (
        <div className={styles.addGrid}>
          {plan.spare.map((category) => (
            <PickButton key={category.id} category={category} onPick={plan.add} />
          ))}
        </div>
      ) : (
        <div className="small sub">Every category has a budget.</div>
      )}
      <div className="tiny muted">
        A new budget starts at {startingWords(plan.budgetsRun, plan.incomes)}. You can change it
        straight away.
      </div>
    </Card>
  );
}

function PickButton({
  category,
  onPick,
}: {
  category: PlanCategory;
  onPick: (category: PlanCategory) => void;
}) {
  const plan = usePlan();
  return (
    <button type="button" className={styles.pick} onClick={() => onPick(category)}>
      <span className={styles.key} style={{ background: colourVar(category.colour) }} />
      <span className="grow">
        <span className={styles.pickName}>{category.name}</span>
        <span className={cx("tiny muted tnum", styles.pickSub)}>
          {dollars(category.lastMonth)} in {plan.lastMonthName} · average {dollars(category.usual)}
        </span>
      </span>
      <Icon name="plus" size="sm" />
    </button>
  );
}

function PlanCard({ rows }: { rows: readonly BudgetDraft[] }) {
  const plan = usePlan();
  const totals = planTotals(rows);
  const moneyIn = plan.moneyIn;
  const left = moneyIn ? moneyIn.cents - totals.monthCents : null;
  const scale = Math.max(moneyIn?.cents ?? 0, totals.monthCents, 1);
  const pct = (cents: number) => `${((Math.max(cents, 0) / scale) * 100).toFixed(1)}%`;
  const parts = [
    { label: "Bills on set dates", cents: totals.setDatesCents, colour: "var(--debt1)" },
    { label: "Everyday", cents: totals.everydayCents, colour: "var(--debt2)" },
    ...(left !== null && left > 0
      ? [{ label: "Left over", cents: left, colour: "var(--left)" }]
      : []),
  ].filter((part) => part.cents > 0);
  const unbudgeted = plan.spare.slice(0, 2).map((category) => category.name.toLowerCase());
  const source =
    moneyIn?.from === "pay"
      ? "Your pay, as a month"
      : moneyIn?.months === 1
        ? `What came in during ${plan.lastMonthName}`
        : `The average of the last ${moneyIn?.months} months`;

  return (
    <Card as="section" aria-label="The plan against money in" className={styles.planCard}>
      <div className={styles.spread}>
        <div className={styles.titled}>
          <h2 className="h2">The plan against money in</h2>
          <span className="muted small">A month, at the amounts below</span>
        </div>
        {left !== null &&
          (left >= 0 ? (
            <Pill tone="good">Fits within money in</Pill>
          ) : (
            <Pill tone="crit">Plans {dollars(-left)} more than comes in</Pill>
          ))}
      </div>
      <div className={styles.kpis}>
        <div>
          <div className="eyebrow">Planned a month</div>
          <div className="big tnum">{dollars(totals.monthCents)}</div>
          <div className={cx("tiny muted", styles.kpiSub)}>
            {plural(rows.length, "budget")}, as a month
          </div>
        </div>
        <div>
          <div className="eyebrow">Typical money in</div>
          <div className="big tnum">{moneyIn ? dollars(moneyIn.cents) : "Not known yet"}</div>
          <div className={cx("tiny muted", styles.kpiSub)}>
            {moneyIn ? source : <TextLink href="/paydays">Add your pay</TextLink>}
          </div>
        </div>
        {left !== null && moneyIn && (
          <div>
            <div className="eyebrow">What that leaves</div>
            <div className={cx("big tnum", left < 0 && "down")}>
              {left < 0 ? `−${dollars(-left)}` : dollars(left)}
            </div>
            <div className={cx("tiny muted", styles.kpiSub)}>
              {left >= 0
                ? `${Math.round((left / moneyIn.cents) * 100)}% of money in, before anything without a budget`
                : "The plan is more than comes in"}
            </div>
          </div>
        )}
      </div>
      {parts.length > 0 && (
        <div>
          <div className={cx(styles.planBar, "small")} aria-hidden="true">
            <div style={{ width: pct(totals.monthCents) }}>
              <div className={styles.barLabel}>
                <span className="sub">Planned</span>
                <span className={cx("tnum", styles.strong)}>{dollars(totals.monthCents)}</span>
              </div>
              <div className={styles.bracket} />
            </div>
            {left !== null && left > 0 && (
              <div>
                <div className={styles.barLabel}>
                  <span className="sub">Left over</span>
                  <span className={cx("tnum", styles.strong)}>{dollars(left)}</span>
                </div>
                <div className={styles.bracket} />
              </div>
            )}
          </div>
          <div
            className={styles.stack}
            role="img"
            aria-label={parts.map((part) => `${part.label} ${dollars(part.cents)}`).join(", ")}
          >
            {parts.map((part) => (
              <span key={part.label} style={{ width: pct(part.cents), background: part.colour }} />
            ))}
          </div>
          <div className={cx(styles.legend, "tnum")}>
            {parts.map((part) => (
              <span key={part.label}>
                <span className={styles.key} style={{ background: part.colour }} />
                {part.label} <b>{dollars(part.cents)}</b>
              </span>
            ))}
          </div>
        </div>
      )}
      <p className={cx("muted small", styles.note)}>
        {moneyIn
          ? `Money in is ${moneyIn.from === "pay" ? "your pay as a month" : moneyIn.months === 1 ? `${plan.lastMonthName}'s` : `the average of the last ${moneyIn.months} months`}. `
          : "Add your pay on When are you paid to see what the plan leaves. "}
        What&apos;s left over also has to cover anything without a budget
        {unbudgeted.length > 0 ? `, like ${unbudgeted.join(" and ")},` : ""} before it goes to
        savings.
      </p>
    </Card>
  );
}

function FlashLine() {
  const plan = usePlan();
  if (!plan.flash) return null;
  return (
    <Well role="status" className={styles.flash}>
      <Icon name="check" size="sm" />
      <span className="grow small">{plan.flash.text}</span>
      {plan.flash.undo && <Button onClick={plan.undo}>Undo</Button>}
    </Well>
  );
}

const KIND_ICON: Record<BudgetKind, "clock" | "wave" | "rollover"> = {
  set: "clock",
  flex: "wave",
  roll: "rollover",
};

function alertsText(draft: BudgetDraft): string {
  if (draft.alert80 && draft.alert100) return "80%, 100%";
  if (draft.alert80) return "80%";
  if (draft.alert100) return "100%";
  return "Off";
}

/** The last months as a small line, ending on a dot. */
function Spark({ months }: { months: readonly number[] }) {
  if (months.length < 2) return null;
  const low = Math.min(...months);
  const high = Math.max(...months);
  const points = months.map((cents, i) => {
    const x = 3 + (i * 66) / (months.length - 1);
    const y = high === low ? 11 : 3 + (1 - (cents - low) / (high - low)) * 16;
    return [x.toFixed(1), y.toFixed(1)];
  });
  const last = points[points.length - 1];
  return (
    <svg className={styles.spark} width="72" height="22" viewBox="0 0 72 22" aria-hidden="true">
      <polyline points={points.map((p) => p.join(",")).join(" ")} />
      <circle cx={last[0]} cy={last[1]} r="2.5" />
    </svg>
  );
}

function PlanTable() {
  const plan = usePlan();
  const totals = planTotals(plan.rows);
  const sum = (pick: (category: PlanCategory) => number) =>
    plan.rows.reduce((total, row) => total + pick(plan.categoryOf(row.categoryId)!), 0);
  const saved = new Map(plan.saved.map((budget) => [budget.categoryId, budget]));
  return (
    <Card as="section" aria-label="Every budget" className={styles.tableCard}>
      <div className={styles.tableHead}>
        <div className={styles.titled}>
          <h2 className="h2">Every budget</h2>
          <span className="muted small tnum">
            {plural(plan.rows.length, "budget")}, {dollars(totals.monthCents)} a month
          </span>
        </div>
        {plan.rows.length > 0 && <span className="muted small">Click a budget to change it</span>}
      </div>
      {plan.rows.length === 0 ? (
        <div className={cx("small sub", styles.phoneEmpty)}>
          No budgets yet. Add one for each thing you want to keep an eye on, starting from what you
          usually spend.
        </div>
      ) : (
        <div className={styles.scroll}>
          <div role="table" aria-label="Every budget, with what you spent" className={styles.table}>
            <div role="row" className={cx(styles.cols, styles.colHead, "small muted")}>
              <span role="columnheader">Budget</span>
              <span role="columnheader">Kind</span>
              <span role="columnheader">How often</span>
              <span role="columnheader" className={styles.num}>
                Amount
              </span>
              <span role="columnheader" className={styles.num}>
                As a month
              </span>
              <span role="columnheader" className={styles.num}>
                Last month
              </span>
              <span role="columnheader" className={styles.avgCol}>
                6-month average
              </span>
              <span role="columnheader">Alerts</span>
              <span role="columnheader" aria-label="Open or close" />
            </div>
            {plan.rows.map((row) => {
              const category = plan.categoryOf(row.categoryId)!;
              const spec = specOf(row);
              const isOpen = plan.open === row.categoryId;
              const kind = kindOf(row);
              const was = saved.get(row.categoryId);
              const changed = !was || !sameBudget(tidyBudget(row), was);
              return (
                <div key={row.categoryId} role="rowgroup">
                  <div role="row" className={cx(styles.cols, styles.row)}>
                    <span role="cell" className={styles.firstCell}>
                      <button
                        type="button"
                        className={styles.rowButton}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Close" : "Change"} ${category.name}, ${amountText(row.amountCents)} ${perWords(spec)}`}
                        onClick={() => plan.setOpen(isOpen ? null : row.categoryId)}
                        style={{ pointerEvents: "auto" }}
                      />
                      <span className={cx(styles.cell, styles.nameLine)}>
                        <span
                          className={styles.key}
                          style={{ background: colourVar(category.colour) }}
                        />
                        <span className="ellipsis">{category.name}</span>
                        {changed && (
                          <span className={styles.changedDot} title="Not saved yet">
                            <span className="sr-only">Not saved yet</span>
                          </span>
                        )}
                      </span>
                    </span>
                    <span role="cell" className={cx(styles.cell, styles.withIcon, "small")}>
                      <Icon name={KIND_ICON[kind]} size="sm" />
                      <span>{KIND_LABELS[kind]}</span>
                    </span>
                    <span role="cell" className={cx(styles.cell, "small sub")}>
                      {PERIOD_LABELS[row.period]}
                    </span>
                    <span
                      role="cell"
                      className={cx(styles.cell, styles.num, "tnum", styles.strong)}
                    >
                      {amountText(row.amountCents)}
                    </span>
                    <span role="cell" className={cx(styles.cell, styles.num, "tnum")}>
                      {dollars(asMonthCents(row.amountCents, spec))}
                    </span>
                    <span role="cell" className={cx(styles.cell, styles.num, "tnum sub")}>
                      {dollars(category.lastMonth)}
                    </span>
                    <span role="cell" className={cx(styles.cell, styles.avgCol, styles.average)}>
                      <span className="tnum">{dollars(category.usual)}</span>
                      <Spark months={category.months} />
                    </span>
                    <span
                      role="cell"
                      className={cx(styles.cell, styles.withIcon, "small")}
                      style={{ color: alertsText(row) === "Off" ? "var(--text-3)" : undefined }}
                    >
                      <Icon name={alertsText(row) === "Off" ? "bell-off" : "bell"} size="sm" />
                      <span className="tnum">{alertsText(row)}</span>
                    </span>
                    <span role="cell" className={cx(styles.cell, styles.chevron)}>
                      <Icon name={isOpen ? "chevron-up" : "chevron-down"} size="sm" />
                    </span>
                  </div>
                  {isOpen && (
                    <div role="row" className={styles.editorRow}>
                      <div role="cell" className={styles.editorCell}>
                        <RowEditor draft={row} category={category} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div role="row" className={cx(styles.cols, styles.totalRow)}>
              <span role="cell">All {plural(plan.rows.length, "budget")}</span>
              <span role="cell" />
              <span role="cell" />
              <span role="cell" />
              <span role="cell" className={cx(styles.num, "tnum")}>
                {dollars(totals.monthCents)}
              </span>
              <span role="cell" className={cx(styles.num, "tnum")}>
                {dollars(sum((category) => category.lastMonth))}
              </span>
              <span role="cell" className={cx(styles.avgCol, "tnum")}>
                {dollars(sum((category) => category.usual))}
              </span>
              <span role="cell" />
              <span role="cell" />
            </div>
          </div>
        </div>
      )}
      <p className={cx("muted small", styles.note, styles.tableNote)}>
        Last month is {plan.lastMonthName}. Budgets counted in weeks or days are shown as a month
        rounded to the nearest $10, because months aren&apos;t whole weeks. The totals add up the
        exact amounts.
      </p>
    </Card>
  );
}

function RowEditor({ draft, category }: { draft: BudgetDraft; category: PlanCategory }) {
  const plan = usePlan();
  const set = plan.setRow;
  const ref = useRef<HTMLDivElement>(null);
  // An editor that opens below the fold, such as a budget just added, scrolls into view.
  useEffect(() => ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), []);
  return (
    <div ref={ref}>
      <Well
        className={cx(styles.editor, styles.wide)}
        aria-label={`Change the ${category.name} budget`}
      >
        <div className={styles.editorHead}>
          <span className={styles.key} style={{ background: colourVar(category.colour) }} />
          <div className="grow">
            <div className="h2">Change {category.name}</div>
            <div className="tiny muted tnum">
              Mine · {dollars(category.thisMonth)} spent so far in {plan.monthName}
            </div>
          </div>
          <IconButton
            icon="close"
            label="Close the editor"
            className={styles.closeSmall}
            onClick={() => plan.setOpen(null)}
          />
        </div>
        <div className={styles.editorGrid}>
          <div>
            <AmountField draft={draft} onChange={set} wide name={category.name} />
            <HowOften draft={draft} onChange={set} wide incomes={plan.incomes} today={plan.today} />
          </div>
          <div>
            <History
              draft={draft}
              onChange={set}
              wide
              category={category}
              monthLabels={plan.monthLabels}
            />
          </div>
          <div>
            <KindPicker draft={draft} onChange={set} />
            <div className={styles.gap} />
            <Alerts draft={draft} onChange={set} wide />
            <div className={styles.editorFoot}>
              <Button
                variant="ghost"
                className={styles.crit}
                onClick={() => plan.remove(draft.categoryId)}
              >
                Remove this budget
              </Button>
              <Button onClick={() => plan.setOpen(null)}>Done</Button>
            </div>
          </div>
        </div>
      </Well>
    </div>
  );
}

function FootBar() {
  const plan = usePlan();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { changed, removed, count } = changesOf(plan.rows, plan.saved);
  const totals = planTotals(plan.rows);
  const moneyIn = plan.moneyIn;

  // Leaving with changes that aren't saved asks first.
  useEffect(() => {
    if (count === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [count]);

  function save() {
    setError(null);
    for (const row of changed) {
      const problem = budgetProblem(row, plan.categoryOf(row.categoryId)?.name ?? "this budget");
      if (problem) {
        setError(problem);
        plan.setOpen(row.categoryId);
        return;
      }
    }
    start(async () => {
      const result = await saveBudgets({
        id: crypto.randomUUID(),
        budgets: changed,
        removed,
      }).catch(() => null);
      if (!result?.ok) {
        setError(result?.error ?? failed);
        return;
      }
      plan.savedAs(
        result.budgets,
        `Saved the plan: ${plural(result.budgets.length, "budget")}, ${dollars(planTotals(result.budgets).monthCents)} a month.`,
      );
      router.refresh();
    });
  }

  return (
    <div className={styles.footBar}>
      <div className="small" aria-live="polite">
        <div className={styles.footTitle}>
          {count === 0 ? "No changes yet" : `${plural(count, "budget")} changed, not saved yet`}
        </div>
        {error ? (
          <p className={styles.error} role="alert">
            <Icon name="alert" size="sm" />
            {error}
          </p>
        ) : (
          <div className="muted tnum">
            Plan {dollars(totals.monthCents)} a month
            {moneyIn
              ? `, leaving ${moneyIn.cents >= totals.monthCents ? dollars(moneyIn.cents - totals.monthCents) : `−${dollars(totals.monthCents - moneyIn.cents)}`} of ${dollars(moneyIn.cents)}`
              : ""}
          </div>
        )}
      </div>
      <div className={styles.footButtons}>
        <Button
          variant="ghost"
          disabled={count === 0 || busy}
          onClick={() => {
            setError(null);
            plan.discard();
          }}
        >
          Cancel
        </Button>
        <Button variant="primary" icon="check" disabled={count === 0 || busy} onClick={save}>
          {busy ? "Saving…" : "Save the plan"}
        </Button>
      </div>
    </div>
  );
}

type Sheet =
  | { mode: "closed" }
  | { mode: "pick" }
  | { mode: "edit"; draft: BudgetDraft; isNew: boolean; key: number };

/** Phones: the plan, a list of budgets, and the Set a budget sheet. */
function PhonePlan() {
  const plan = usePlan();
  const [sheet, setSheet] = useState<Sheet>({ mode: "closed" });
  const [opened, setOpened] = useState(0);
  const arrived = useRef(plan.editing ?? null);

  // Sent here to change one budget: on a phone its sheet opens. Desktop opens its row instead.
  useEffect(() => {
    const budget = plan.saved.find((saved) => saved.categoryId === arrived.current);
    arrived.current = null;
    if (budget && !window.matchMedia(WIDE).matches)
      setSheet({ mode: "edit", draft: toDraft(budget), isNew: false, key: 0 });
  }, [plan.saved]);
  const saved = plan.saved.map(toDraft);
  const has = new Set(saved.map((budget) => budget.categoryId));
  const spare = plan.categories.filter((category) => !has.has(category.id));
  const edit = (draft: BudgetDraft, isNew: boolean) => {
    setOpened(opened + 1);
    setSheet({ mode: "edit", draft, isNew, key: opened + 1 });
  };

  return (
    <>
      <PlanCard rows={saved} />
      {plan.flash && !plan.flash.undo && <FlashLine />}
      <Card as="section" aria-label="Every budget" className={styles.phoneList}>
        {saved.length === 0 ? (
          <div className={cx("small sub", styles.phoneEmpty)}>
            No budgets yet. Add one for each thing you want to keep an eye on.
          </div>
        ) : (
          saved.map((draft) => {
            const category = plan.categoryOf(draft.categoryId)!;
            const spec = specOf(draft);
            return (
              <button
                key={draft.categoryId}
                type="button"
                className={styles.phoneRow}
                onClick={() => edit(draft, false)}
              >
                <span className={styles.key} style={{ background: colourVar(category.colour) }} />
                <span className="grow">
                  <span className={cx("ellipsis", styles.pickName)}>{category.name}</span>
                  <span className="muted small tnum">
                    {PERIOD_LABELS[draft.period]} · {amountText(draft.amountCents)} {perWords(spec)}
                  </span>
                </span>
                <span className={cx("tnum", styles.rowAmount)}>
                  <span className={styles.pickName}>
                    {dollars(asMonthCents(draft.amountCents, spec))}
                  </span>
                  <span className="tiny muted">a month</span>
                </span>
                <Icon name="chevron-right" size="sm" />
              </button>
            );
          })
        )}
      </Card>
      <Button block size="lg" icon="plus" onClick={() => setSheet({ mode: "pick" })}>
        Add a budget
      </Button>

      <BottomSheet
        open={sheet.mode === "pick"}
        onClose={() => setSheet({ mode: "closed" })}
        title="Add a budget"
      >
        <p className={cx("small sub", styles.note)}>
          A new budget starts at {startingWords(plan.budgetsRun, plan.incomes)}.
        </p>
        <div className={cx(styles.pickList, styles.addGrid)} style={{ marginTop: 12 }}>
          {spare.length === 0 ? (
            <div className="small sub">Every category has a budget.</div>
          ) : (
            spare.map((category) => (
              <PickButton
                key={category.id}
                category={category}
                onPick={(picked) => edit(newBudget(picked, plan.budgetsRun, plan.incomes), true)}
              />
            ))
          )}
        </div>
      </BottomSheet>

      {sheet.mode === "edit" && (
        <BudgetSheet
          key={sheet.key}
          start={sheet.draft}
          isNew={sheet.isNew}
          onClose={() => setSheet({ mode: "closed" })}
        />
      )}
    </>
  );
}

/** Set a budget, or change one, on a phone. Saves straight away. */
function BudgetSheet({
  start: initial,
  isNew,
  onClose,
}: {
  start: BudgetDraft;
  isNew: boolean;
  onClose: () => void;
}) {
  const plan = usePlan();
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const category = plan.categoryOf(draft.categoryId)!;

  function send(budgets: BudgetDraft[], removed: string[], done: string) {
    setError(null);
    start(async () => {
      const result = await saveBudgets({ id: crypto.randomUUID(), budgets, removed }).catch(
        () => null,
      );
      if (!result?.ok) {
        setError(result?.error ?? failed);
        setConfirming(false);
        return;
      }
      plan.savedAs(result.budgets, done);
      router.refresh();
      onClose();
    });
  }

  function save() {
    const problem = budgetProblem(draft, category.name);
    if (problem) {
      setError(problem);
      return;
    }
    send(
      [draft],
      [],
      `${isNew ? "Added" : "Saved"} the ${category.name} budget: ${amountText(draft.amountCents)} ${perWords(specOf(draft))}.`,
    );
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={isNew ? "Set a budget" : "Change a budget"}
      footer={
        confirming ? undefined : (
          <>
            {error && (
              <p className={styles.error} role="alert" style={{ marginBottom: 10 }}>
                <Icon name="alert" size="sm" />
                {error}
              </p>
            )}
            <Button variant="primary" size="lg" block disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </>
        )
      }
    >
      <SheetHeading category={category} monthName={plan.monthName} />
      <div className={cx(styles.fields, styles.sheetFields)}>
        <div style={{ marginTop: 24 }}>
          <AmountField draft={draft} onChange={setDraft} wide={false} name={category.name} />
        </div>
        <div style={{ marginTop: 18 }}>
          <HowOften
            draft={draft}
            onChange={setDraft}
            wide={false}
            incomes={plan.incomes}
            today={plan.today}
          />
        </div>
        <History
          draft={draft}
          onChange={setDraft}
          wide={false}
          category={category}
          monthLabels={plan.monthLabels}
        />
        <RolloverRow draft={draft} onChange={setDraft} />
        <div style={{ marginTop: 14 }}>
          <Alerts draft={draft} onChange={setDraft} wide={false} />
        </div>
        {!isNew &&
          (confirming ? (
            <Well
              role="alertdialog"
              aria-label={`Remove the ${category.name} budget?`}
              className={styles.confirm}
            >
              <div>
                <div className={styles.confirmTitle}>Remove the {category.name} budget?</div>
                <div className={cx("sub small", styles.note)}>{removeWords(category.name)}</div>
              </div>
              {error && (
                <p className={styles.error} role="alert">
                  <Icon name="alert" size="sm" />
                  {error}
                </p>
              )}
              <div className={styles.confirmButtons}>
                <Button size="lg" disabled={busy} onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
                <Button
                  size="lg"
                  className={styles.crit}
                  disabled={busy}
                  onClick={() =>
                    send(
                      [],
                      [draft.id!],
                      `Removed the ${category.name} budget. Its spending stays sorted as ${category.name}.`,
                    )
                  }
                >
                  {busy ? "Removing…" : "Remove"}
                </Button>
              </div>
            </Well>
          ) : (
            <Button
              variant="ghost"
              block
              className={cx(styles.crit, styles.remove)}
              onClick={() => setConfirming(true)}
            >
              Remove this budget
            </Button>
          ))}
      </div>
    </BottomSheet>
  );
}
