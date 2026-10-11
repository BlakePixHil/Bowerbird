"use client";

import { useState, useTransition } from "react";
import { Button, Checkbox, cx, Icon, Pill, type IconName } from "@/components/ui";
import { ICONS } from "@/components/ui/icons";
import { isWaiting, sendChange } from "@/components/offline/send";
import { WAITING_WORDS } from "@/components/offline/words";
import type { ActivityCategory, ActivityRow, CategoryChoice } from "@/lib/access";
import styles from "./Activity.module.css";
import { changeCategory, markTransfer, sortShop } from "./actions";

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

/** What changed, so the list can show it straight away. */
export type RowsChanged = {
  ids: string[];
  category: ActivityCategory | null;
  /** Set when the change paired rows as a transfer, or took them out of one. */
  paired?: boolean;
  /** Made with no signal: it waits on this device, so the page can't refresh from the server. */
  waiting?: boolean;
};

/** A category from the grid as a row carries it. */
export const asCategory = ({
  id,
  name,
  kind,
  icon,
  colourSlot,
}: CategoryChoice): ActivityCategory => ({
  id,
  name,
  kind,
  icon,
  colourSlot,
});

/**
 * The category grid in the transaction sheet. Picking one saves it at once, then asks whether to
 * sort the shop that way always, with the option to change its earlier rows too. On a split row,
 * picking one takes the split away, and it can't be marked a transfer until then.
 */
export function Categorise({
  row,
  categories,
  onChanged,
}: {
  row: ActivityRow;
  categories: readonly CategoryChoice[];
  onChanged: (change: RowsChanged) => void;
}) {
  // A split row's categories are its parts, so nothing in the grid is picked.
  const split = row.parts.length > 0;
  const [chosen, setChosen] = useState(split ? null : (row.category?.id ?? null));
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
      const picked = asCategory(category);
      const result = await sendChange(
        "category",
        { id: crypto.randomUUID(), transactionId: row.id, categoryId: category.id },
        changeCategory,
        {
          id: row.id,
          patch: {
            category: picked,
            parts: [],
            notCounted: row.paired || picked.kind === "transfer",
          },
        },
      );
      if (!result?.ok) {
        setChosen(before);
        setError(result?.error ?? "Couldn't save that. Check your connection and try again.");
        return;
      }
      // With no signal there's no shop to ask about yet. That waits for the next change.
      if (isWaiting(result)) {
        onChanged({ ids: [row.id], category: picked, waiting: true });
        setSaid(WAITING_WORDS);
        return;
      }
      onChanged({ ids: [row.id], category: result.category });
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
      const result = await sendChange(
        "shop-rule",
        {
          id: crypto.randomUUID(),
          merchantId: question.shop.id,
          categoryId: question.category.id,
          earlier,
        },
        sortShop,
      );
      if (!result?.ok) {
        setError(result?.error ?? "Couldn't save the rule. Check your connection and try again.");
        return;
      }
      if (isWaiting(result)) {
        setAsk(null);
        setSaid(WAITING_WORDS);
        return;
      }
      onChanged({ ids: result.changed, category: result.category });
      setAsk(null);
      setSaid(
        earlier
          ? `Rule saved. ${transactions(result.inCategory, question.shop.name)} now in ${question.category.name}.`
          : `Rule saved for new ${question.shop.name} transactions.`,
      );
    });
  }

  function transfer(on: boolean) {
    setAsk(null);
    setSaid(null);
    setError(null);
    // With no signal, it shows in Transfers, or with no category, until the server pairs it up.
    const transfers = categories.find((c) => c.kind === "transfer");
    const shown = on ? (transfers ? asCategory(transfers) : row.category) : null;
    start(async () => {
      const result = await sendChange(
        "transfer",
        { id: crypto.randomUUID(), transactionId: row.id, transfer: on },
        markTransfer,
        { id: row.id, patch: { category: shown, parts: [], notCounted: on, paired: false } },
      );
      if (!result?.ok) {
        setError(result?.error ?? "Couldn't save that. Check your connection and try again.");
        return;
      }
      if (isWaiting(result)) {
        setChosen(shown?.id ?? null);
        onChanged({ ids: [row.id], category: shown, paired: false, waiting: true });
        setSaid(WAITING_WORDS);
        return;
      }
      setChosen(result.category?.id ?? null);
      onChanged({ ids: result.ids, category: result.category, paired: result.paired });
      setSaid(
        !on
          ? "Counted again. Pick its category."
          : result.paired
            ? "Matched with the other side, and left out of totals."
            : "Left out of totals.",
      );
    });
  }

  return (
    <section className={styles.categorise} aria-labelledby={`category-${row.id}`}>
      <h3 id={`category-${row.id}`} className="h3">
        Category
      </h3>
      {split && (
        <p className={cx("small muted", styles.splitHint)}>
          Split across {row.parts.length} categories. Picking one here puts all of it in that
          category instead.
        </p>
      )}
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

      {!split && (
        <Button
          variant="ghost"
          icon="transfer"
          className={styles.transferButton}
          disabled={busy}
          onClick={() => transfer(!row.notCounted)}
        >
          {row.notCounted ? "Not a transfer" : "This is a transfer between your accounts"}
        </Button>
      )}

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
