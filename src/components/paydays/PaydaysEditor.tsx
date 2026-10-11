"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  Avatar,
  Button,
  Card,
  Chip,
  Divider,
  Icon,
  Pill,
  SelectField,
  TextField,
  Well,
  cx,
} from "@/components/ui";
import type { BudgetsRun, Income } from "@/lib/access";
import { INCOME_NAME_MAX, INCOMES_MAX } from "@/lib/access/limits";
import {
  addDays,
  addMonths,
  daysBetween,
  formatMoney,
  formatShortDate,
  mainIncome,
  PAY_FREQUENCIES,
  parseMoney,
  paydayAfter,
  paydayOnOrBefore,
  type PaySchedule,
  type PlainDate,
} from "@/lib/money";
import type { FoundPay } from "@/lib/sorting/paydays";
import { saveMyPaydays } from "./actions";
import {
  cycleWords,
  daysWords,
  FREQUENCY_LABELS,
  MONTH_DAYS,
  payHeadline,
  seenWords,
  withFrequency,
  withPayday,
} from "./paydays";
import styles from "./Paydays.module.css";

/** An account pay can come into. */
export type PayAccount = { id: string; name: string; kind: string; archived: boolean };

/** Where pay usually lands: an everyday account, then savings, then anything but a card or loan. */
function likelyAccount(accounts: readonly PayAccount[]): string | null {
  const open = accounts.filter((account) => !account.archived);
  const pick =
    open.find((account) => account.kind === "everyday") ??
    open.find((account) => account.kind === "savings") ??
    open.find((account) => !["credit", "loan", "mortgage"].includes(account.kind));
  return pick?.id ?? null;
}

/** A saved income, with the deposits that back it up when the app can see them. */
export type SavedIncome = Income & { found: FoundPay | null };

type Draft = {
  key: string;
  id: string | null;
  label: string;
  amountText: string;
  accountId: string | null;
  /** `anchorDate` is empty until someone picks the next payday. */
  schedule: PaySchedule;
  /** The deposits it was spotted in. Null for an income someone added by hand. */
  found: FoundPay | null;
  /** Picking the next payday. */
  picking: boolean;
};

const scheduleOf = (pay: PaySchedule): PaySchedule => ({
  frequency: pay.frequency,
  anchorDate: pay.anchorDate,
  secondDay: pay.secondDay,
});

const amountText = (cents: number) => formatMoney(cents, { decimals: "auto", sign: "never" });

const lastSeen = (found: FoundPay) => found.seen[found.seen.length - 1];

function fromSaved(income: SavedIncome): Draft {
  return {
    key: income.id,
    id: income.id,
    label: income.label,
    amountText: amountText(income.amountCents),
    accountId: income.accountId,
    schedule: scheduleOf(income),
    found: income.found,
    picking: false,
  };
}

function fromFound(found: FoundPay, label: string): Draft {
  return {
    key: crypto.randomUUID(),
    id: null,
    label,
    amountText: amountText(found.amountCents),
    accountId: found.accountId,
    schedule: scheduleOf(found),
    found,
    picking: false,
  };
}

function byHand(label: string, accountId: string | null): Draft {
  return {
    key: crypto.randomUUID(),
    id: null,
    label,
    amountText: "",
    accountId,
    schedule: { frequency: "fortnightly", anchorDate: "", secondDay: null },
    found: null,
    picking: true,
  };
}

const centsOf = (draft: Draft) => {
  const cents = parseMoney(draft.amountText.trim());
  return cents !== null && cents > 0 ? cents : null;
};

/**
 * "When are you paid?" from its boards: each income with the deposits it was spotted in, how often
 * it comes and the next payday, then how new budgets should run. Saving replaces the person's
 * incomes with what's here.
 */
export function PaydaysEditor({
  today,
  accounts,
  saved,
  budgetsRun: savedRun,
  suggestions,
  person,
  intro,
  submitLabel = "Save",
}: {
  today: PlainDate;
  accounts: readonly PayAccount[];
  saved: readonly SavedIncome[];
  budgetsRun: BudgetsRun;
  /** Regular pay the app spotted, biggest first. */
  suggestions: readonly FoundPay[];
  person: { initials: string; name: string };
  /** What the page is for, shown under the title on phones (desktop has it in the header). */
  intro?: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [busy, startSaving] = useTransition();
  const firstAccount = likelyAccount(accounts);
  const [drafts, setDrafts] = useState<Draft[]>(() => {
    if (saved.length > 0) return saved.map(fromSaved);
    if (suggestions[0]) return [fromFound(suggestions[0], "Your pay")];
    return [byHand("Your pay", firstAccount)];
  });
  const [run, setRun] = useState<BudgetsRun>(savedRun);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const names = new Map(accounts.map((account) => [account.id, account.name]));
  const ready = drafts.flatMap((draft) => {
    const amountCents = centsOf(draft);
    return draft.schedule.anchorDate && amountCents ? [{ ...draft.schedule, amountCents }] : [];
  });
  const main = mainIncome(ready);
  const unused = suggestions.filter(
    (found) =>
      !drafts.some(
        (draft) => draft.found?.payer === found.payer && draft.found.accountId === found.accountId,
      ),
  );

  const change = (key: string, update: (draft: Draft) => Draft) => {
    setDrafts((list) => list.map((draft) => (draft.key === key ? update(draft) : draft)));
    setDone(false);
    setError(null);
  };
  const remove = (key: string) => {
    setDrafts((list) => list.filter((draft) => draft.key !== key));
    if (drafts.length === 1 && run === "payday") setRun("monthly");
    setDone(false);
  };
  const addAnother = () => {
    setDrafts((list) => [
      ...list,
      unused[0]
        ? fromFound(unused[0], unused[0].payerName)
        : byHand("", list[0]?.accountId ?? firstAccount),
    ]);
    setDone(false);
  };

  const save = () => {
    for (const draft of drafts) {
      if (!draft.schedule.anchorDate)
        return setError(`Pick the next payday for “${draft.label || "your income"}”.`);
      if (!centsOf(draft))
        return setError(`Say how much “${draft.label || "your income"}” brings in each payday.`);
    }
    setError(null);
    startSaving(async () => {
      const result = await saveMyPaydays({
        budgetsRun: run,
        incomes: drafts.map((draft) => ({
          id: draft.id,
          label: draft.label,
          amountCents: centsOf(draft),
          accountId: draft.accountId,
          ...draft.schedule,
        })),
      });
      if (!result.ok) return setError(result.error);
      // Saved in the order listed, so each draft takes its saved id.
      setDrafts((list) =>
        list.map((draft, i) => ({
          ...draft,
          id: result.paydays.incomes[i]?.id ?? draft.id,
          picking: false,
        })),
      );
      setDone(true);
      router.refresh();
    });
  };

  return (
    <div className={styles.page}>
      {intro && <p className={cx(styles.intro, styles.phoneOnly)}>{intro}</p>}
      {drafts.length === 0 && (
        <Card className={styles.none}>
          <span className={styles.noneTitle}>No regular pay</span>
          <span className="sub small">
            Budgets will run by calendar month or by week. Add an income whenever you start getting
            paid regularly.
          </span>
        </Card>
      )}
      {drafts.map((draft, i) => (
        <IncomeBlock
          key={draft.key}
          draft={draft}
          today={today}
          accounts={accounts}
          accountName={(draft.accountId && names.get(draft.accountId)) || null}
          isMain={
            !!main &&
            draft.schedule.anchorDate === main.anchorDate &&
            draft.schedule.frequency === main.frequency &&
            centsOf(draft) === main.amountCents
          }
          person={person}
          first={i === 0}
          change={(update) => change(draft.key, update)}
          remove={() => remove(draft.key)}
        />
      ))}
      {drafts.length < INCOMES_MAX && (
        <button type="button" className={cx(styles.addLink, "hit")} onClick={addAnother}>
          <Icon name="plus" size="sm" />
          <span>{drafts.length === 0 ? "Add an income" : "Add another income"}</span>
        </button>
      )}

      <Divider className={styles.phoneOnly} />
      <BudgetsRunPicker
        run={run}
        setRun={(next) => {
          setRun(next);
          setDone(false);
        }}
        today={today}
        nextPayday={main ? paydayAfter(main, today) : null}
      />

      <div className={styles.foot}>
        {error && (
          <p role="alert" className={styles.error}>
            <Icon name="alert" size="sm" />
            <span>{error}</span>
          </p>
        )}
        {done && !error && (
          <Pill tone="good" className={styles.donePill}>
            <span role="status">
              Saved. Budgets and Until payday will line up with these paydays.
            </span>
          </Pill>
        )}
        <Button variant="primary" size="lg" disabled={busy} onClick={save} className={styles.save}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function IncomeBlock({
  draft,
  today,
  accounts,
  accountName,
  isMain,
  person,
  first,
  change,
  remove,
}: {
  draft: Draft;
  today: PlainDate;
  accounts: readonly PayAccount[];
  accountName: string | null;
  isMain: boolean;
  person: { initials: string; name: string };
  first: boolean;
  change: (update: (draft: Draft) => Draft) => void;
  remove: () => void;
}) {
  const id = useId();
  const { schedule, found } = draft;
  const set = schedule.anchorDate !== "";
  const next = set ? paydayAfter(schedule, today) : null;
  const last = found ? lastSeen(found) : set ? paydayOnOrBefore(schedule, today) : null;
  const suggested = found && !draft.id ? scheduleOf(found) : null;
  const cents = centsOf(draft);
  const name = draft.label || "this income";

  const pickFrequency = (frequency: PaySchedule["frequency"]) =>
    change((d) => {
      if (!d.schedule.anchorDate)
        return {
          ...d,
          schedule: {
            ...d.schedule,
            frequency,
            secondDay: frequency === "twice_monthly" ? 31 : null,
          },
        };
      if (d.found && frequency === d.found.frequency)
        return { ...d, schedule: scheduleOf(d.found) };
      const from = d.found ? lastSeen(d.found) : paydayOnOrBefore(d.schedule, today);
      return { ...d, schedule: withFrequency(d.schedule, frequency, from) };
    });

  const card = (
    <Card
      as="section"
      aria-labelledby={`${id}-head`}
      className={cx(styles.payCard, !found && styles.payCardShort)}
    >
      <div className={styles.cardTop}>
        <span className="eyebrow">
          {found && !draft.id
            ? "Suggested from your deposits"
            : found
              ? "Seen in your deposits"
              : "Added by you"}
        </span>
        <Pill tone="accent" icon="download">
          {draft.label || "New income"}
        </Pill>
      </div>
      <h2 id={`${id}-head`} className={styles.headline}>
        {!set
          ? "Pick when it comes in"
          : cents
            ? payHeadline({ amountCents: cents, accountName, schedule })
            : capitalise(cycleWords(schedule))}
      </h2>
      {set && last && next && (
        <div className="sub small">
          Last {formatShortDate(last)}, next {formatShortDate(next)}
        </div>
      )}
      {found && next && (
        <>
          <Timeline seen={found.seen} next={next} cents={found.amountCents} shown={4} phone />
          <Timeline seen={found.seen} next={next} cents={found.amountCents} shown={6} />
          <Divider className={styles.cardDivider} />
          <div className={cx("muted small tnum", styles.phoneOnly)}>
            {seenWords(found.seen, found.lowCents, found.highCents)}
          </div>
          <div className={cx(styles.legend, styles.wideOnly)}>
            <span>
              <span className={styles.legendSeen} aria-hidden="true" />
              Pay seen,{" "}
              {found.lowCents === found.highCents
                ? `${amountText(found.lowCents)} each time`
                : `${amountText(found.lowCents)} to ${amountText(found.highCents)}`}
            </span>
            <span>
              <span className={styles.legendNext} aria-hidden="true" />
              Next, expected
            </span>
            <span className="muted">
              {found.seen.length} times since {formatShortDate(found.seen[0])}
            </span>
          </div>
        </>
      )}
      {isMain && next && (
        <Well className={cx(styles.countdown, styles.wideOnly)}>
          <Avatar owner="you" size="sm" initials={person.initials} label={person.name} />
          <span className="small grow">
            Until payday will count down from here:{" "}
            <span className="tnum" style={{ fontWeight: 600 }}>
              {daysWords(daysBetween(today, next))}
            </span>{" "}
            <span className="muted">to {formatShortDate(next)}</span>
          </span>
        </Well>
      )}
    </Card>
  );

  const usable = accounts.filter((account) => !account.archived || account.id === draft.accountId);

  return (
    <div className={styles.income}>
      {card}
      <Card
        as="section"
        aria-label={`How often and when ${name} comes in`}
        className={styles.controls}
      >
        <h2 className={cx("h2", styles.wideOnly)}>
          {first && found ? "Confirm or change" : "When it comes in"}
        </h2>
        {!found && (
          <div className={styles.byHand}>
            <TextField
              label="Name"
              value={draft.label}
              maxLength={INCOME_NAME_MAX}
              placeholder="Other income"
              onChange={(e) => change((d) => ({ ...d, label: e.target.value }))}
            />
            <TextField
              label="Each payday"
              inputMode="decimal"
              placeholder="0.00"
              value={draft.amountText}
              trailing={<span className="muted small">AUD</span>}
              error={draft.amountText && !cents ? "Enter an amount, like 3,260" : undefined}
              onChange={(e) => change((d) => ({ ...d, amountText: e.target.value }))}
            />
            {usable.length > 0 && (
              <SelectField
                label="Comes into"
                value={draft.accountId ?? ""}
                options={[
                  ...usable.map((account) => ({ value: account.id, label: account.name })),
                  { value: "", label: "An account that isn't here" },
                ]}
                onChange={(e) => change((d) => ({ ...d, accountId: e.target.value || null }))}
              />
            )}
          </div>
        )}
        <div className="h3">How often</div>
        <div role="group" aria-label={`How often ${name} comes in`} className={styles.chips}>
          {PAY_FREQUENCIES.map((frequency) => (
            <Chip
              key={frequency}
              on={schedule.frequency === frequency}
              onClick={() => pickFrequency(frequency)}
            >
              {FREQUENCY_LABELS[frequency]}
            </Chip>
          ))}
        </div>
        {suggested && schedule.frequency !== suggested.frequency && (
          <div className={cx("small sub", styles.changed)}>
            <Icon name="info" size="sm" />
            <span>
              Changed from what we suggested.{" "}
              <button
                type="button"
                className={styles.inlineLink}
                onClick={() => change((d) => ({ ...d, schedule: suggested }))}
              >
                Use {cycleWords(suggested).replace(/^on /, "")}
              </button>
            </span>
          </div>
        )}
        <div className="h3">Next payday</div>
        {draft.picking || !next ? (
          <div className={styles.picking}>
            <TextField
              label="Next payday"
              hideLabel
              type="date"
              min={addDays(today, 1)}
              max={addMonths(today, 13)}
              value={next ?? ""}
              onChange={(e) => {
                const date = e.target.value;
                if (date) change((d) => ({ ...d, schedule: withPayday(d.schedule, date) }));
              }}
            />
            {next && (
              <Button onClick={() => change((d) => ({ ...d, picking: false }))}>Done</Button>
            )}
          </div>
        ) : (
          <button
            type="button"
            className={styles.nextField}
            aria-label={`Next payday, ${formatShortDate(next)}. Change`}
            onClick={() => change((d) => ({ ...d, picking: true }))}
          >
            <Icon name="calendar" size="sm" />
            <span className="grow">{formatShortDate(next)}</span>
            <span className={styles.changeWord}>Change</span>
          </button>
        )}
        {schedule.frequency === "twice_monthly" && set && (
          <SelectField
            label="Other payday each month"
            value={String(schedule.secondDay ?? 31)}
            options={MONTH_DAYS}
            onChange={(e) =>
              change((d) => ({
                ...d,
                schedule: { ...d.schedule, secondDay: Number(e.target.value) },
              }))
            }
          />
        )}
        <button type="button" className={cx(styles.removeLink, "hit")} onClick={remove}>
          <Icon name="trash" size="sm" />
          <span>Remove this income</span>
        </button>
      </Card>
    </div>
  );
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The last few paydays seen as dots on a line, then the next one, from the boards. */
function Timeline({
  seen,
  next,
  cents,
  shown,
  phone = false,
}: {
  seen: readonly PlainDate[];
  next: PlainDate;
  cents: number;
  shown: number;
  phone?: boolean;
}) {
  const days = [...seen.slice(-shown), next];
  const n = days.length;
  const at = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const label = days
    .slice(0, -1)
    .map((day) => formatShortDate(day))
    .join(", ");
  return (
    <div
      role="img"
      aria-label={`Last paydays: ${label}, ${amountText(cents)} each. Next expected ${formatShortDate(next)}.`}
      className={cx(styles.timeline, phone ? styles.phoneOnly : styles.wideOnly)}
    >
      <span className={styles.solid} style={{ width: `${at(n - 2)}%` }} aria-hidden="true" />
      <span className={styles.dotted} style={{ left: `${at(n - 2)}%` }} aria-hidden="true" />
      {days.map((day, i) => {
        const isNext = i === n - 1;
        const isLast = i === n - 2;
        // Phones have room for every date; desktop labels every other one back from the last.
        const labelled = phone || isNext || (n - 2 - i) % 2 === 0;
        return (
          <span key={day} aria-hidden="true">
            <span
              className={cx(styles.dot, isNext && styles.nextDot)}
              style={{ left: `${at(i)}%` }}
            />
            <span className={styles.dotLabel} style={{ left: `${at(i)}%` }}>
              <span className={cx("mono", (isNext || isLast) && styles.dotDateStrong)}>
                {labelled ? formatShortDate(day, { weekday: false }).toUpperCase() : " "}
              </span>
              <span className="tiny">{isNext ? "Next" : isLast ? "Last" : " "}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** "How should budgets run?": the period new budgets start with. */
function BudgetsRunPicker({
  run,
  setRun,
  today,
  nextPayday,
}: {
  run: BudgetsRun;
  setRun: (run: BudgetsRun) => void;
  today: PlainDate;
  nextPayday: PlainDate | null;
}) {
  const first = addMonths(today, 0, 1);
  const lastOfMonth = addDays(addMonths(first, 1, 1), -1);
  const options: { value: BudgetsRun; title: string; sub: string; off?: boolean }[] = [
    {
      value: "monthly",
      title: "Monthly",
      sub: `Calendar month, ${formatShortDate(first, { weekday: false })} to ${formatShortDate(lastOfMonth, { weekday: false })}`,
    },
    {
      value: "payday",
      title: "Payday to payday",
      sub: nextPayday
        ? `Starts again each payday, next on ${formatShortDate(nextPayday)}`
        : "Add your pay first",
      off: !nextPayday,
    },
    { value: "weekly", title: "Weekly", sub: "Monday to Sunday" },
  ];
  return (
    <Card as="section" aria-labelledby="budgets-run" className={styles.runCard}>
      <fieldset className={styles.runSet}>
        <legend className={styles.runLegend}>
          <h2 id="budgets-run" className={styles.runTitle}>
            How should budgets run?
          </h2>
          <span className="sub small">
            The stretch of time each budget covers before it starts again.
          </span>
        </legend>
        <div className={styles.runOptions}>
          {options.map((option) => (
            <label key={option.value} className={cx(styles.runOption, option.off && styles.runOff)}>
              <input
                type="radio"
                name="budgets-run"
                value={option.value}
                checked={run === option.value}
                disabled={option.off}
                onChange={() => setRun(option.value)}
                className={styles.radio}
              />
              <span className="grow">
                <span className={styles.runOptionTitle}>{option.title}</span>
                <span className="muted small">{option.sub}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className={cx("muted small", styles.runNote)}>
        Each budget can use its own period later, like a weekly groceries budget.
      </p>
    </Card>
  );
}
