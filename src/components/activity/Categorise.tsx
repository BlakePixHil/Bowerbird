"use client";

import { useState, useTransition } from "react";
import { Button, Checkbox, cx, Icon, Pill, type IconName } from "@/components/ui";
import { ICONS } from "@/components/ui/icons";
import type { ActivityCategory, ActivityRow, CategoryChoice } from "@/lib/access";
import styles from "./Activity.module.css";
import { changeCategory, sortShop } from "./actions";

/** How many categories show before More. The board's grid is two rows of four, More included. */
const SHOWN = 7;

/** A row's categories to pick from: money in leads with Income, then the coloured ones, then the rest. */
export function gridOf(
  categories: readonly CategoryChoice[],
  row: Pick<ActivityRow, "amountCents">,
  chosen: string | null,
): CategoryChoice[] {
  const rank = (c: CategoryChoice) =>
    row.amountCents > 0 && c.kind === "income" ? 0 : (c.colourSlot ?? 10);
  const ranked = [...categories].sort((a, b) => rank(a) - rank(b) || a.sortOrder - b.sortOrder);
  const top = ranked.slice(0, SHOWN);
  const current = ranked.find((c) => c.id === chosen);
  if (current && !top.includes(current)) top[SHOWN - 1] = current;
  return top;
}

const iconOf = (c: CategoryChoice): IconName =>
  c.icon && Object.hasOwn(ICONS, c.icon) ? (c.icon as IconName) : "tag";

const transactions = (n: number, shop: string) => `${n} ${shop} transaction${n === 1 ? "" : "s"}`;

type Ask = { shop: { id: string; name: string }; earlier: number; category: ActivityCategory };

/**
 * The category grid in the transaction sheet. Picking one saves it at once, then asks whether to
 * sort the shop that way always, with the option to change its earlier rows too.
 */
export function Categorise({
  row,
  categories,
  onChanged,
}: {
  row: ActivityRow;
  categories: readonly CategoryChoice[];
  /** Rows that moved into a category, so the list shows it straight away. */
  onChanged: (ids: string[], category: ActivityCategory) => void;
}) {
  const [chosen, setChosen] = useState(row.category?.id ?? null);
  const [all, setAll] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [past, setPast] = useState(true);
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const shown = all ? categories : gridOf(categories, row, chosen);

  function pick(category: CategoryChoice) {
    if (busy || category.id === chosen) return;
    const before = chosen;
    setChosen(category.id);
    setAsk(null);
    setSaid(null);
    setError(null);
    start(async () => {
      const result = await changeCategory({
        id: crypto.randomUUID(),
        transactionId: row.id,
        categoryId: category.id,
      }).catch(() => null);
      if (!result?.ok) {
        setChosen(before);
        setError(result?.error ?? "Couldn't save that. Check your connection and try again.");
        return;
      }
      onChanged([row.id], result.category);
      if (!result.shop) return;
      if (result.ruled) {
        setSaid(`${result.shop.name} is always sorted into ${result.category.name}.`);
        return;
      }
      setPast(true);
      setAsk({ shop: result.shop, earlier: result.earlier, category: result.category });
    });
  }

  function always(question: Ask) {
    const earlier = past && question.earlier > 0;
    setError(null);
    start(async () => {
      const result = await sortShop({
        id: crypto.randomUUID(),
        merchantId: question.shop.id,
        categoryId: question.category.id,
        earlier,
      }).catch(() => null);
      if (!result?.ok) {
        setError(result?.error ?? "Couldn't save the rule. Check your connection and try again.");
        return;
      }
      onChanged(result.changed, result.category);
      setAsk(null);
      setSaid(
        earlier
          ? `Rule saved. ${transactions(result.inCategory, question.shop.name)} now in ${question.category.name}.`
          : `Rule saved for new ${question.shop.name} transactions.`,
      );
    });
  }

  return (
    <section className={styles.categorise} aria-labelledby={`category-${row.id}`}>
      <h3 id={`category-${row.id}`} className="h3">
        Category
      </h3>
      <div className={styles.catGrid}>
        {shown.map((category) => (
          <button
            key={category.id}
            type="button"
            className={cx(styles.catButton, category.id === chosen && styles.catPicked)}
            aria-pressed={category.id === chosen}
            disabled={busy && category.id !== chosen}
            onClick={() => pick(category)}
          >
            <Icon name={iconOf(category)} />
            <span>{category.name}</span>
          </button>
        ))}
        {!all && categories.length > shown.length && (
          <button
            type="button"
            className={styles.catButton}
            aria-expanded={false}
            onClick={() => setAll(true)}
          >
            <Icon name="more" />
            <span>More</span>
          </button>
        )}
      </div>

      {ask && (
        <div className={styles.ask} role="group" aria-labelledby={`ask-${row.id}`}>
          <div className={styles.askHead}>
            <Icon name="wand" />
            <div>
              <div id={`ask-${row.id}`} className={styles.askTitle}>
                Always put {ask.shop.name} in {ask.category.name}?
              </div>
              <div className="sub small">
                New {ask.shop.name} transactions will be sorted for you.
              </div>
            </div>
          </div>
          {ask.earlier > 0 && (
            <Checkbox checked={past} onChange={(event) => setPast(event.target.checked)}>
              <span className="small">
                {ask.earlier === 1
                  ? "Also change the earlier one"
                  : `Also change the ${ask.earlier.toLocaleString("en-AU")} earlier ones`}
              </span>
            </Checkbox>
          )}
          <div className={styles.askButtons}>
            <Button
              size="lg"
              disabled={busy}
              onClick={() => {
                setAsk(null);
                setSaid("Changed this one only.");
              }}
            >
              Just this once
            </Button>
            <Button variant="primary" size="lg" disabled={busy} onClick={() => always(ask)}>
              Yes, always
            </Button>
          </div>
        </div>
      )}

      <div role="status" className={styles.said}>
        {said && (
          <Pill tone="good" className={styles.saidPill}>
            {said}
          </Pill>
        )}
        {error && (
          <Pill tone="crit" className={styles.saidPill}>
            {error}
          </Pill>
        )}
      </div>
    </section>
  );
}
