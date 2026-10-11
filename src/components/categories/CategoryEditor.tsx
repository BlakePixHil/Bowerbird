"use client";

import { useState, useTransition } from "react";
import {
  Button,
  colourVar,
  cx,
  Icon,
  IconButton,
  Pill,
  Switch,
  TextField,
  Tile,
  Well,
} from "@/components/ui";
import type { CategorySummary, RuleRow } from "@/lib/access";
import { CATEGORY_NAME_MAX } from "@/lib/access/limits";
import { COLOUR_SLOTS, type CategoryColour } from "@/lib/sorting/colour";
import { mergeInto, newCategory, removeCategory, saveCategory, updateRule } from "./actions";
import {
  colourNote,
  colourOf,
  dollars,
  iconOf,
  kindName,
  monthName,
  monthShort,
  ruleMatch,
  ruleWhen,
  rulesText,
  transactionsText,
} from "./look";
import styles from "./Manage.module.css";

/** What happened, for the page to show once the change is saved. */
export type Done = { message: string; picked?: string | null };

const SWATCHES: readonly CategoryColour[] = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c-other"];

const failed = "Couldn't save that. Check your connection and try again.";

type EditorProps = {
  category: CategorySummary;
  /** Every category, for merging. */
  categories: readonly CategorySummary[];
  /** The rules that send things here. */
  rules: readonly RuleRow[];
  /** The first of each month in `category.months`, and of this month. */
  monthStarts: readonly string[];
  thisMonth: string;
  /** Desktop shows the last few months as a chart. */
  wide: boolean;
  onDone: (done: Done) => void;
  onCancel: () => void;
  onSeeRules: () => void;
  /** Told when the merge view opens or closes, so the phone sheet can say which it is. */
  onMerging?: (merging: boolean) => void;
};

/**
 * Edit a category, from the "Edit or merge a category" boards: its name, how its colour works,
 * whether it counts toward budgets, the rules that send things here, then Merge and Delete.
 */
export function CategoryEditor(props: EditorProps) {
  const [merging, setMerging] = useState(false);
  const show = (on: boolean) => {
    setMerging(on);
    props.onMerging?.(on);
  };
  return merging ? (
    <MergeCategory {...props} onBack={() => show(false)} />
  ) : (
    <EditCategory {...props} onMerge={() => show(true)} />
  );
}

function Swatches({ category }: { category: CategorySummary }) {
  const colour = colourOf(category);
  const label =
    category.kind === "income"
      ? `${category.name} uses the money-in green`
      : category.colourSlot
        ? `${category.name} uses pinned colour ${category.colourSlot} of ${COLOUR_SLOTS}`
        : `${category.name} uses the shared grey`;
  return (
    <div className={styles.swatches} role="img" aria-label={label}>
      {SWATCHES.map((swatch) => (
        <span
          key={swatch}
          className={cx(styles.swatch, swatch === colour && styles.swatchOn)}
          style={{ background: colourVar(swatch) }}
        />
      ))}
    </div>
  );
}

function History({
  category,
  monthStarts,
  thisMonth,
}: Pick<EditorProps, "category" | "monthStarts" | "thisMonth">) {
  const values = [...category.months, category.cents];
  const top = Math.max(...values, category.usual, 1) * 1.12;
  const colour = colourVar(colourOf(category));
  const starts = [...monthStarts, thisMonth];
  return (
    <div className={styles.history}>
      <div className={styles.historyHead}>
        <span className="h3">
          Last {category.months.length} months and {monthName(thisMonth)}
        </span>
        {category.usual > 0 && (
          <span className="small sub tnum">
            {category.months.length}-month average {dollars(category.usual)}
          </span>
        )}
      </div>
      <div className={styles.plot} role="list" aria-label={`${category.name} by month`}>
        {category.usual > 0 && (
          <span
            className={styles.average}
            style={{ bottom: `${(category.usual / top) * 100}%` }}
            aria-hidden="true"
          />
        )}
        {values.map((value, i) => {
          const now = i === values.length - 1;
          return (
            <span
              key={starts[i]}
              role="listitem"
              className={styles.col}
              aria-label={`${now ? `${monthName(starts[i])} so far` : monthName(starts[i])}: ${dollars(value)}`}
            >
              <span
                className={cx(styles.colBar, now && styles.colNow)}
                style={{
                  height: `${Math.max((value / top) * 100, value > 0 ? 2 : 0)}%`,
                  background: colour,
                }}
              />
            </span>
          );
        })}
      </div>
      <div className={styles.colLabels} aria-hidden="true">
        {values.map((value, i) => (
          <span key={starts[i]}>
            <span className="mono">{monthShort(starts[i])}</span>
            <span className="tiny tnum">{dollars(value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function RuleSwitch({ rule, category }: { rule: RuleRow; category: CategorySummary }) {
  const [on, setOn] = useState(rule.enabled);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={styles.ruleLine}>
      <span className="grow small">
        <span className="sub">{ruleWhen(rule)}</span>{" "}
        <span className={styles.strong}>{ruleMatch(rule)}</span>
        <span className="muted tiny tnum"> · {rule.sorted.toLocaleString("en-AU")} sorted</span>
        {error && <span className={cx("tiny", styles.errorText)}> {error}</span>}
      </span>
      <Switch
        checked={on}
        disabled={busy}
        aria-label={`${ruleMatch(rule)} to ${category.name}`}
        onChange={(event) => {
          const next = event.target.checked;
          setOn(next);
          setError(null);
          start(async () => {
            const result = await updateRule({
              id: crypto.randomUUID(),
              ruleId: rule.id,
              enabled: next,
            }).catch(() => null);
            if (!result?.ok) {
              setOn(!next);
              setError(result?.error ?? failed);
            }
          });
        }}
      >
        <span className="sr-only">On</span>
      </Switch>
    </div>
  );
}

function EditCategory({
  category,
  rules,
  monthStarts,
  thisMonth,
  wide,
  onDone,
  onCancel,
  onSeeRules,
  onMerge,
}: EditorProps & { onMerge: () => void }) {
  const [name, setName] = useState(category.name);
  const [counts, setCounts] = useState(category.countsTowardBudgets);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, start] = useTransition();
  const spending = category.kind === "spending";
  const changed = name.trim() !== category.name || counts !== category.countsTowardBudgets;
  const empty = category.everCount === 0;
  const month = monthName(thisMonth);

  function save() {
    setError(null);
    start(async () => {
      const result = await saveCategory({
        id: crypto.randomUUID(),
        categoryId: category.id,
        name,
        countsTowardBudgets: counts,
      }).catch(() => null);
      if (!result?.ok) setError(result?.error ?? failed);
      else onDone({ message: "Saved." });
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const result = await removeCategory({
        id: crypto.randomUUID(),
        categoryId: category.id,
      }).catch(() => null);
      setConfirmDelete(false);
      if (!result?.ok) setError(result?.error ?? failed);
      else onDone({ message: `${category.name} is deleted.`, picked: null });
    });
  }

  return (
    <form
      className={styles.editor}
      aria-label={`Edit ${category.name}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (changed && !busy) save();
      }}
    >
      <div className={styles.editorHead}>
        <Tile icon={iconOf(category)} size="lg" />
        <div className="grow">
          <div className={styles.titleLine}>
            <span className={styles.bigKey} style={{ background: colourVar(colourOf(category)) }} />
            <h2 className={cx("mid", "ellipsis")}>{category.name}</h2>
          </div>
          <div className="muted small tnum">
            {wide
              ? `${kindName(category.kind)} · ${transactionsText(category.everCount)} in all`
              : `${dollars(category.cents)} ${category.kind === "transfer" ? "moved " : ""}in ${month} · ${transactionsText(category.everCount)} in all`}
          </div>
        </div>
      </div>

      {wide && <History category={category} monthStarts={monthStarts} thisMonth={thisMonth} />}

      <TextField
        label="Name"
        icon="pencil"
        value={name}
        maxLength={CATEGORY_NAME_MAX}
        onChange={(event) => setName(event.target.value)}
        autoComplete="off"
      />

      <div>
        <div className={styles.spread}>
          <span className="h3">Colour</span>
          <Pill tone="quiet" icon={category.colourSlot ? "pin" : undefined}>
            {category.kind === "income"
              ? "Money-in colour"
              : category.colourSlot
                ? `Pinned colour ${category.colourSlot} of ${COLOUR_SLOTS}`
                : "Shared grey"}
          </Pill>
        </div>
        <Swatches category={category} />
        <p className={cx("muted small", styles.note)}>{colourNote(category)}</p>
      </div>

      {spending ? (
        <div className={styles.switchRow}>
          <div className="grow">
            <div className={styles.strong}>Counts toward budgets</div>
            <div className="muted small">
              {counts
                ? "Counts in the household total. No budget of its own yet"
                : "Shown in reports, left out of every budget"}
            </div>
          </div>
          <Switch checked={counts} onChange={(event) => setCounts(event.target.checked)}>
            <span className="sr-only">Counts toward budgets</span>
          </Switch>
        </div>
      ) : (
        <Well className={styles.kindNote}>
          <Icon name={category.kind === "income" ? "income" : "transfer"} size="sm" />
          <span className="sub small">
            {category.kind === "income"
              ? "Income is never counted as spending. It shows in money in, money out and until payday."
              : "Not counted in spending or income. Money moved between your own accounts lands here, including credit card repayments, when the same amount goes out and comes in within 3 days."}
          </span>
        </Well>
      )}

      <div>
        <div className={styles.spread}>
          <span className="h3">Rules that send things here</span>
          {rules.length > 0 && (
            <button type="button" className={styles.link} onClick={onSeeRules}>
              See in rules
            </button>
          )}
        </div>
        <Well className={styles.ruleWell}>
          {rules.map((rule) => (
            <RuleSwitch key={rule.id} rule={rule} category={category} />
          ))}
          {rules.length === 0 && (
            <div className={cx("small muted", styles.noRules)}>
              No rules yet. Pick &ldquo;Yes, always&rdquo; on a transaction to make one.
            </div>
          )}
        </Well>
      </div>

      {spending && (
        <div className={styles.dangerRows}>
          <button type="button" className={styles.actionRow} onClick={onMerge} disabled={busy}>
            <Icon name="merge" />
            <span className="grow">Merge into another category</span>
            <Icon name="chevron-right" size="sm" />
          </button>
          {confirmDelete ? (
            <div className={styles.confirm} role="group" aria-label={`Delete ${category.name}`}>
              <span className="small">
                Delete {category.name}?
                {category.rules > 0 && ` Its ${rulesText(category.rules)} go too.`}
              </span>
              <div className={styles.confirmButtons}>
                <Button onClick={() => setConfirmDelete(false)} disabled={busy}>
                  Keep it
                </Button>
                <Button variant="primary" className={styles.crit} onClick={remove} disabled={busy}>
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={cx(styles.actionRow, styles.deleteRow)}
              disabled={!empty || busy}
              aria-describedby={empty ? undefined : `delete-why-${category.id}`}
              onClick={() => setConfirmDelete(true)}
            >
              <Icon name="trash" />
              <span className="grow">Delete category</span>
              {!empty && (
                <span id={`delete-why-${category.id}`} className="small muted">
                  Only when it&rsquo;s empty
                </span>
              )}
            </button>
          )}
        </div>
      )}

      <div role="status" className={styles.status}>
        {error && (
          <Pill tone="crit" className={styles.statusPill}>
            {error}
          </Pill>
        )}
      </div>

      <div className={styles.editorButtons}>
        {wide && (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          size={wide ? "md" : "lg"}
          block={!wide}
          disabled={!changed || busy}
        >
          Save
        </Button>
      </div>
    </form>
  );
}

const SHOWN_TARGETS = 5;

function MergeCategory({
  category,
  categories,
  wide,
  thisMonth,
  onDone,
  onBack,
}: EditorProps & { onBack: () => void }) {
  const [target, setTarget] = useState<string | null>(null);
  const [all, setAll] = useState(wide);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const targets = categories
    .filter((c) => c.kind === "spending" && c.id !== category.id)
    .sort((a, b) => b.cents - a.cents || b.usual - a.usual || a.sortOrder - b.sortOrder);
  const shown = all ? targets : targets.slice(0, SHOWN_TARGETS);
  const picked = targets.find((c) => c.id === target) ?? null;
  const month = monthName(thisMonth);
  const moving = [
    category.rules > 0 ? rulesText(category.rules) : null,
    category.everCount > 0 ? transactionsText(category.everCount) : null,
  ].filter(Boolean);

  function merge(into: CategorySummary) {
    setError(null);
    start(async () => {
      const result = await mergeInto({
        id: crypto.randomUUID(),
        categoryId: category.id,
        intoId: into.id,
      }).catch(() => null);
      if (!result?.ok) setError(result?.error ?? failed);
      else onDone({ message: `${category.name} is merged into ${into.name}.`, picked: into.id });
    });
  }

  return (
    <div className={styles.editor} aria-label={`Merge ${category.name} into another category`}>
      <div className={styles.mergeTop}>
        <IconButton icon="arrow-left" label={`Back to editing ${category.name}`} onClick={onBack} />
        <span className="small sub">{category.name}</span>
      </div>
      <div>
        <h2 className="mid">Merge {category.name} into&hellip;</h2>
        <p className={cx("sub small", styles.note)}>
          Pick the category that takes over. {category.name} goes away once it&rsquo;s merged.
        </p>
      </div>
      <Well className={styles.targets}>
        <div role="radiogroup" aria-label="Category to merge into">
          {shown.map((c) => (
            <label key={c.id} className={cx(styles.target, c.id === target && styles.targetOn)}>
              <input
                type="radio"
                className="sr-only"
                name={`merge-${category.id}`}
                checked={c.id === target}
                onChange={() => setTarget(c.id)}
              />
              <span className={styles.radio} aria-hidden="true" />
              <span className={styles.key} style={{ background: colourVar(colourOf(c)) }} />
              <span className={cx("grow", styles.strong)}>{c.name}</span>
              <span className="muted small tnum">
                {wide
                  ? `usually ${dollars(c.usual)}`
                  : `${dollars(c.cents)} in ${month.slice(0, 3)}`}
              </span>
            </label>
          ))}
        </div>
      </Well>
      {!all && targets.length > shown.length && (
        <Button variant="ghost" className={styles.showAll} onClick={() => setAll(true)}>
          Show all {targets.length} categories
        </Button>
      )}
      <div className={styles.banner} role="note">
        <Icon name="info" size="sm" />
        <div>
          <div className={styles.strong}>
            {moving.length > 0 ? `Its ${moving.join(" and ")} move too` : "Nothing in it yet"}
          </div>
          <div className="sub small">
            {picked
              ? `They all go to ${picked.name}, and reports from before the merge show them as ${picked.name} too.`
              : "They go to the category you pick."}
          </div>
        </div>
      </div>
      <div role="status" className={styles.status}>
        {error && (
          <Pill tone="crit" className={styles.statusPill}>
            {error}
          </Pill>
        )}
      </div>
      <div className={styles.mergeButtons}>
        <Button size={wide ? "md" : "lg"} onClick={onBack} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size={wide ? "md" : "lg"}
          disabled={!picked || busy}
          onClick={() => picked && merge(picked)}
        >
          {picked ? `Merge into ${picked.name}` : "Pick a category"}
        </Button>
      </div>
    </div>
  );
}

/** A new spending category: just its name. It starts grey and earns a colour by spending. */
export function AddCategory({
  wide,
  onDone,
  onCancel,
}: {
  wide: boolean;
  onDone: (done: Done) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <form
      className={styles.editor}
      aria-label="Add a category"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || !name.trim()) return;
        setError(null);
        start(async () => {
          const result = await newCategory({ id: crypto.randomUUID(), name }).catch(() => null);
          if (!result?.ok) setError(result?.error ?? failed);
          else onDone({ message: `${name.trim()} is added.`, picked: result.id });
        });
      }}
    >
      {wide && <h2 className="mid">Add a category</h2>}
      <TextField
        label="Name"
        icon="pencil"
        value={name}
        maxLength={CATEGORY_NAME_MAX}
        placeholder="Pets"
        onChange={(event) => setName(event.target.value)}
        autoComplete="off"
        autoFocus={wide}
      />
      <p className={cx("muted small", styles.note)}>
        It counts as spending and starts grey. If it becomes one of your top seven, it gets a colour
        of its own.
      </p>
      <div role="status" className={styles.status}>
        {error && (
          <Pill tone="crit" className={styles.statusPill}>
            {error}
          </Pill>
        )}
      </div>
      <div className={styles.editorButtons}>
        {wide && (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          size={wide ? "md" : "lg"}
          block={!wide}
          disabled={!name.trim() || busy}
        >
          Add category
        </Button>
      </div>
    </form>
  );
}
