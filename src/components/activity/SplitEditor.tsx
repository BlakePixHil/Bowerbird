"use client";

import { useState, useTransition } from "react";
import { Button, Chip, colourVar, cx, Icon, IconButton, Pill, Well } from "@/components/ui";
import { APP_NAME } from "@/config/app";
import type { ActivityCategory, ActivityRow, CategoryChoice, SplitPart } from "@/lib/access";
import { SPLIT_MAX_PARTS } from "@/lib/access/limits";
import { formatMoney, parseMoney } from "@/lib/money";
import { categoryColour } from "@/lib/sorting/colour";
import styles from "./Activity.module.css";
import { saveSplit, unsplit } from "./actions";
import {
  backLabel,
  countsLine,
  evenCents,
  evenLabel,
  partChoices,
  plain,
  splitState,
  startingParts,
  type DraftPart,
} from "./split";

const failed = "Couldn't save that. Check your connection and try again.";

export type SplitDone =
  | { split: true; parts: SplitPart[]; category: ActivityCategory }
  | { split: false; category: ActivityCategory | null };

/**
 * Split one transaction across categories, from the "Split a transaction" boards: a list of parts,
 * each a category and an amount, a bar that shows what's left, quick ways to share it out, then
 * Save once the parts come to the whole payment.
 */
export function SplitEditor({
  row,
  categories,
  onDone,
  onCancel,
}: {
  row: ActivityRow;
  categories: readonly CategoryChoice[];
  onDone: (done: SplitDone) => void;
  onCancel: () => void;
}) {
  const choices = partChoices(categories, row);
  const total = Math.abs(row.amountCents);
  const [saved] = useState(() => startingParts(row, choices));
  const [parts, setParts] = useState<DraftPart[]>(saved);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const byId = new Map(choices.map((c) => [c.id, c]));
  const state = splitState(total, parts);
  const n = parts.length;
  const wasSplit = row.parts.length > 0;
  const changed = JSON.stringify(parts.map(strip)) !== JSON.stringify(saved.map(strip));

  const set = (i: number, part: Partial<DraftPart>) =>
    setParts((now) => now.map((p, j) => (j === i ? { ...p, ...part } : p)));
  const nameOf = (part: DraftPart, i: number) =>
    (part.categoryId && byId.get(part.categoryId)?.name) || `part ${i + 1}`;

  // "Put the rest in Shopping": the last part takes whatever the others leave.
  const others = parts.slice(0, -1).reduce((sum, part) => sum + part.cents, 0);
  const canRest = state.left !== 0 && total - others >= 0;
  const last = parts[n - 1];
  const lastName = last.categoryId ? byId.get(last.categoryId)?.name : undefined;

  function save() {
    if (state.why || busy) return;
    setError(null);
    start(async () => {
      const result = await saveSplit({
        id: crypto.randomUUID(),
        transactionId: row.id,
        parts: parts.map((part) => ({ categoryId: part.categoryId!, cents: part.cents })),
      }).catch(() => null);
      if (!result?.ok) {
        setError(result?.error ?? failed);
        return;
      }
      onDone({ split: true, parts: result.parts, category: result.category });
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const result = await unsplit({ id: crypto.randomUUID(), transactionId: row.id }).catch(
        () => null,
      );
      if (!result?.ok) {
        setError(result?.error ?? failed);
        return;
      }
      onDone({ split: false, category: result.category });
    });
  }

  return (
    <section className={styles.split} aria-labelledby={`split-${row.id}`}>
      <div className={styles.splitHead}>
        <h3 id={`split-${row.id}`} className="h3">
          Split across categories
        </h3>
        <span className="muted small tnum">{n} parts</span>
      </div>

      <ul className={styles.parts} aria-label="Parts of the split">
        {parts.map((part, i) => {
          const category = part.categoryId ? byId.get(part.categoryId) : undefined;
          const name = nameOf(part, i);
          const isOpen = open === i;
          return (
            <li key={part.key}>
              <Well className={styles.part}>
                <div className={styles.partLine}>
                  <button
                    type="button"
                    className={cx(styles.partPick, isOpen && styles.partOpen)}
                    aria-expanded={isOpen}
                    aria-label={`Category for part ${i + 1}: ${category?.name ?? "Pick one"}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    <span
                      className={cx(styles.key, !category && styles.keyEmpty)}
                      style={category ? { background: colourVar(categoryColour(category)) } : {}}
                    />
                    <span className={cx(styles.partName, !category && styles.quiet)}>
                      {category?.name ?? "Pick one"}
                    </span>
                    <Icon name={isOpen ? "chevron-up" : "chevron-down"} size="sm" />
                  </button>
                  <div className={styles.partAmount} role="group" aria-label={`Amount for ${name}`}>
                    <IconButton
                      icon="minus"
                      label={`Take $1 off ${name}`}
                      onClick={() => set(i, { cents: Math.max(0, part.cents - 100), text: null })}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Amount for ${name}`}
                      value={part.text ?? plain(part.cents)}
                      onChange={(event) => {
                        const cents = parseMoney(event.target.value);
                        set(i, {
                          text: event.target.value,
                          cents: cents === null ? 0 : Math.abs(cents),
                        });
                      }}
                      onBlur={() => set(i, { text: null })}
                    />
                    <IconButton
                      icon="plus"
                      label={`Add $1 to ${name}`}
                      onClick={() => set(i, { cents: part.cents + 100, text: null })}
                    />
                  </div>
                  <IconButton
                    icon="trash"
                    label={`Remove ${name}`}
                    className={styles.partRemove}
                    disabled={n <= 2}
                    onClick={() => {
                      setParts((now) => now.filter((_, j) => j !== i));
                      setOpen(null);
                    }}
                  />
                </div>
                {isOpen && (
                  <div
                    role="group"
                    aria-label={`Category for part ${i + 1}`}
                    className={styles.partChips}
                  >
                    {choices.map((choice) => {
                      const taken = parts.some(
                        (other, j) => j !== i && other.categoryId === choice.id,
                      );
                      return (
                        <Chip
                          key={choice.id}
                          on={choice.id === part.categoryId}
                          disabled={taken}
                          title={taken ? "Another part already uses it" : undefined}
                          onClick={() => {
                            set(i, { categoryId: choice.id });
                            setOpen(null);
                          }}
                        >
                          <span
                            className={styles.key}
                            style={{ background: colourVar(categoryColour(choice)) }}
                          />
                          {choice.name}
                        </Chip>
                      );
                    })}
                  </div>
                )}
              </Well>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className={styles.addPart}
        disabled={n >= SPLIT_MAX_PARTS}
        onClick={() => {
          const key = crypto.randomUUID();
          setParts((now) => [
            ...now,
            { key, categoryId: null, cents: Math.max(0, state.left), text: null },
          ]);
          setOpen(n);
        }}
      >
        <Icon name="plus" size="sm" />
        <span>Add a part</span>
      </button>

      <div className={styles.splitSum}>
        <div className={styles.splitSumLine}>
          <Pill tone={state.tone}>
            <span role="status">{state.words}</span>
          </Pill>
          <span className="small sub tnum">
            {formatMoney(state.sum)} of {formatMoney(total)}
          </span>
        </div>
        <SplitBar parts={parts} total={total} byId={byId} />
      </div>

      <div className={styles.quick} role="group" aria-label="Quick split">
        <Chip
          icon="split-even"
          onClick={() => {
            const amounts = evenCents(total, n);
            setParts((now) => now.map((p, i) => ({ ...p, cents: amounts[i], text: null })));
          }}
        >
          {evenLabel(n)}
        </Chip>
        {canRest && (
          <Chip
            icon="arrow-right"
            onClick={() => set(n - 1, { cents: total - others, text: null })}
          >
            Put the rest in {lastName ?? "the last part"}
          </Chip>
        )}
        {wasSplit && changed && (
          <Chip
            icon="reset"
            onClick={() => {
              setParts(saved);
              setOpen(null);
            }}
          >
            {backLabel(saved)}
          </Chip>
        )}
      </div>

      <Well className={styles.about}>
        <Icon name="pie" size="sm" />
        <span className="small sub">
          {countsLine(parts, (id) => byId.get(id)?.name)} Your bank still shows one payment of{" "}
          {formatMoney(total)}. Splitting only changes how {APP_NAME} counts it.
        </span>
      </Well>

      {error && (
        <Pill tone="crit" className={styles.saidPill}>
          <span role="alert">{error}</span>
        </Pill>
      )}

      <div className={styles.splitButtons}>
        <Button size="lg" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="lg"
          disabled={!!state.why || busy}
          aria-describedby={state.why ? `split-why-${row.id}` : undefined}
          onClick={save}
        >
          Save split
        </Button>
      </div>
      {state.why && (
        <div id={`split-why-${row.id}`} className={cx("small muted", styles.splitWhy)}>
          {state.why}
        </div>
      )}
      {wasSplit && (
        <Button
          variant="ghost"
          icon="trash"
          className={styles.unsplit}
          disabled={busy}
          onClick={remove}
        >
          Remove split
        </Button>
      )}
    </section>
  );
}

const strip = (part: DraftPart) => [part.categoryId, part.cents];

/** The adding-up bar: each part in its category's colour, what's left as an empty track. */
function SplitBar({
  parts,
  total,
  byId,
}: {
  parts: readonly DraftPart[];
  total: number;
  byId: ReadonlyMap<string, CategoryChoice>;
}) {
  const sum = parts.reduce((n, part) => n + part.cents, 0);
  const scale = Math.max(total, sum, 1);
  const left = total - sum;
  const words = parts
    .map((part) => {
      const name = part.categoryId ? byId.get(part.categoryId)?.name : undefined;
      return `${name ?? "No category"} ${formatMoney(part.cents)}`;
    })
    .join(", ");
  const extra =
    left > 0
      ? `, ${formatMoney(left)} not split yet`
      : left < 0
        ? `, ${formatMoney(-left)} more than ${formatMoney(total)}`
        : "";
  return (
    <>
      <div className={styles.splitBar} role="img" aria-label={`${words}${extra}`}>
        {parts
          .filter((part) => part.cents > 0)
          .map((part) => {
            const category = part.categoryId ? byId.get(part.categoryId) : undefined;
            return (
              <span
                key={part.key}
                style={{
                  flexGrow: part.cents / scale,
                  background: colourVar(category ? categoryColour(category) : "ghost"),
                }}
              />
            );
          })}
        {left > 0 && <span className={styles.splitLeft} style={{ flexGrow: left / scale }} />}
        {left < 0 && (
          <span className={styles.splitOver} style={{ left: `${(total / scale) * 100}%` }} />
        )}
      </div>
      <div className={cx("tiny muted tnum", styles.splitAxis)} aria-hidden="true">
        <span>$0</span>
        <span>{formatMoney(scale)}</span>
      </div>
    </>
  );
}
