"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BottomSheet,
  colourVar,
  cx,
  Icon,
  Pill,
  StackedBar,
  Tile,
  useWide,
  Well,
  type StackPart,
} from "@/components/ui";
import type { CategoryOverview, CategorySummary, RuleRow } from "@/lib/access";
import { AddCategory, CategoryEditor, type Done } from "./CategoryEditor";
import {
  colourOf,
  dollars,
  iconOf,
  kindName,
  metaLine,
  monthName,
  shareText,
  transactionsText,
} from "./look";
import styles from "./Manage.module.css";
import { useManageParams } from "./params";

type CategoriesTabProps = {
  overview: CategoryOverview;
  rules: readonly RuleRow[];
  /** "Day 10 of 31". */
  dayLine: string;
};

const biggestFirst = (a: CategorySummary, b: CategorySummary) =>
  b.cents - a.cents || b.usual - a.usual || a.sortOrder - b.sortOrder;

/** The share bar's parts: each coloured category, then everything else in grey. */
function stackOf(spending: readonly CategorySummary[], unsorted: number): StackPart[] {
  const coloured = spending.filter((c) => c.colourSlot && c.cents > 0);
  const rest =
    spending.filter((c) => !c.colourSlot).reduce((sum, c) => sum + c.cents, 0) + unsorted;
  const parts = coloured.map((c) => ({ label: c.name, value: c.cents, colour: colourOf(c) }));
  return rest > 0
    ? [...parts, { label: "Everything else", value: rest, colour: "c-other" }]
    : parts;
}

/**
 * The Categories part of Categories and rules, from the "Categories and rules" and "Desktop:
 * Categories and rules" boards: this month's spending by category, then Income, then Not
 * counted. A phone opens a category in a sheet; desktop shows it in the panel beside the table.
 */
export function CategoriesTab({ overview, rules, dayLine }: CategoriesTabProps) {
  const router = useRouter();
  const wide = useWide();
  const { category: pickedId, adding, change } = useManageParams();
  const [sheet, setSheet] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);

  const all = overview.categories;
  const spending = all.filter((c) => c.kind === "spending").sort(biggestFirst);
  const income = all.filter((c) => c.kind === "income");
  const notCounted = all.filter((c) => c.kind === "transfer");
  const total = spending.reduce((sum, c) => sum + c.cents, 0) + overview.unsorted.cents;
  const used = spending.filter((c) => c.cents > 0).length;
  const month = monthName(overview.from);
  const stack = stackOf(spending, overview.unsorted.cents);
  const ordered = [...spending, ...income, ...notCounted];
  const picked =
    all.find((c) => c.id === pickedId) ?? (wide && !adding ? ordered[0] : undefined) ?? null;

  function pick(id: string) {
    change({ category: id, add: null });
    setNotice(null);
    if (!wide) setSheet(true);
  }

  function done({ message, picked: next }: Done) {
    setNotice(message);
    setSheet(false);
    change({ add: null, ...(next !== undefined ? { category: next } : {}) });
    router.refresh();
  }

  const editor = (c: CategorySummary) => (
    <CategoryEditor
      key={`${c.id}|${c.name}|${c.countsTowardBudgets}|${c.rules}`}
      category={c}
      categories={all}
      rules={rules.filter((rule) => rule.category.id === c.id)}
      monthStarts={overview.monthStarts}
      thisMonth={overview.from}
      wide={wide}
      onDone={done}
      onCancel={() => change({ category: null })}
      onSeeRules={() => change({ tab: "rules", category: null, for: c.id })}
      onMerging={(on) => setMerging(on ? c.id : null)}
    />
  );

  const status = (
    <div role="status" className={styles.notice}>
      {notice && (
        <Pill tone="good" className={styles.statusPill}>
          {notice}
        </Pill>
      )}
    </div>
  );

  return (
    <div className={styles.flow}>
      <div className={cx(styles.main, styles.w2)}>
        {status}

        {/* Phone */}
        <div className={styles.phoneOnly}>
          <section className={cx(styles.card, styles.summary)} aria-label="All spending">
            <div className={styles.spread}>
              <span className="eyebrow">All spending, {month} so far</span>
              <span className="muted small">{dayLine}</span>
            </div>
            <div className={styles.summaryTotal}>
              <span className="big tnum">{dollars(total)}</span>
              <span className="sub small">
                across {used} {used === 1 ? "category" : "categories"}
              </span>
            </div>
            {stack.length > 0 && (
              <StackedBar
                label={`Spending in ${month}`}
                parts={stack}
                height={10}
                className={styles.stack}
              />
            )}
            <div className={styles.pinNote}>
              <Icon name="pin" size="sm" />
              <span className="muted small">
                The top seven categories keep their own colour everywhere, in every chart. The rest
                share grey.
              </span>
            </div>
          </section>

          <div className={styles.sectionHead}>
            <h2 className="h2">Spending</h2>
            <span className="muted small">{month} · share of spending</span>
          </div>
          <section className={cx(styles.card, styles.rows)} aria-label="Spending categories">
            {spending.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                share={shareText(c.cents, total)}
                total={total}
                month={month}
                onPick={pick}
              />
            ))}
            {overview.unsorted.count > 0 && (
              <Link href="/activity?show=check" className={styles.catRow}>
                <span className={styles.catLine}>
                  <Tile icon="inbox" size="sm" />
                  <span className="grow">
                    <span className={styles.nameLine}>
                      <span className={styles.key} style={{ background: colourVar("c-other") }} />
                      <span className={cx("ellipsis", styles.strong)}>Not sorted yet</span>
                    </span>
                    <span className="muted small">
                      {transactionsText(overview.unsorted.count)} to check in Activity
                    </span>
                  </span>
                  <span className={styles.amountCol}>
                    <span className="amt">{dollars(overview.unsorted.cents)}</span>
                    <span className="muted tiny tnum">
                      {shareText(overview.unsorted.cents, total)}
                    </span>
                  </span>
                  <Icon name="chevron-right" size="sm" />
                </span>
              </Link>
            )}
          </section>

          {income.length > 0 && (
            <>
              <div className={styles.sectionHead}>
                <h2 className="h2">Income</h2>
                <span className="muted small">{month} so far</span>
              </div>
              <section className={cx(styles.card, styles.rows)} aria-label="Income">
                {income.map((c) => (
                  <CategoryRow key={c.id} category={c} month={month} onPick={pick} />
                ))}
              </section>
            </>
          )}

          {notCounted.length > 0 && (
            <>
              <div className={styles.sectionHead}>
                <h2 className="h2">Not counted</h2>
                <span className="muted small">Left out of spending and income</span>
              </div>
              <section className={cx(styles.card, styles.rows)} aria-label="Not counted">
                {notCounted.map((c) => (
                  <CategoryRow key={c.id} category={c} month={month} onPick={pick} />
                ))}
                <Well className={styles.transferNote}>
                  <Icon name="transfer" size="sm" />
                  <span className="sub small">
                    Money moved between your own accounts, credit card repayments included. Found
                    when the same amount goes out and comes in within 3 days.
                  </span>
                </Well>
              </section>
            </>
          )}

          <button
            type="button"
            className={styles.addButton}
            onClick={() => {
              change({ add: "1", category: null });
              setNotice(null);
            }}
          >
            <Icon name="plus" />
            <span>Add a category</span>
          </button>
        </div>

        {/* Desktop */}
        <section className={cx(styles.card, styles.desktopOnly)} aria-labelledby="every-category">
          <div className={styles.cardHead}>
            <div className={styles.cardTitle}>
              <h2 id="every-category" className="h2">
                Every category
              </h2>
              <span className="muted small">{all.length} categories</span>
            </div>
            <span className="muted small tnum">
              {dollars(total)} spent in {month} so far
            </span>
          </div>
          {stack.length > 0 && (
            <div className={styles.stackBlock}>
              <StackedBar label={`Spending in ${month}`} parts={stack} height={12} />
              <div className={styles.legend} aria-hidden="true">
                {stack.map((part) => (
                  <span key={part.label}>
                    <span className={styles.key} style={{ background: colourVar(part.colour) }} />
                    {part.label} <span className="muted tnum">{shareText(part.value, total)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className={styles.scrollX}>
            <table className={styles.table} aria-label={`Every category, ${month} so far`}>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Kind</th>
                  <th scope="col" className={styles.num}>
                    {month}
                  </th>
                  <th scope="col" className={styles.num}>
                    {overview.monthStarts.length}-month average
                  </th>
                  <th scope="col" className={styles.num}>
                    Transactions
                  </th>
                  <th scope="col">Share of {month}</th>
                  <th scope="col" className={styles.num}>
                    Rules
                  </th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((c) => {
                  const on = picked?.id === c.id;
                  const share = c.kind === "spending" ? (c.cents / (total || 1)) * 100 : 0;
                  return (
                    <tr key={c.id} className={cx(on && styles.pickedRow)}>
                      <td>
                        <button
                          type="button"
                          className={styles.rowButton}
                          aria-pressed={on}
                          aria-label={`Show ${c.name}, ${dollars(c.cents)} in ${month}`}
                          onClick={() => pick(c.id)}
                        />
                        <span className={styles.nameLine}>
                          <span
                            className={styles.key}
                            style={{ background: colourVar(colourOf(c)) }}
                          />
                          <span className={cx("ellipsis", on && styles.strong)}>{c.name}</span>
                        </span>
                      </td>
                      <td className={cx("small", c.kind === "spending" ? "sub" : "muted")}>
                        {kindName(c.kind)}
                      </td>
                      <td className={cx(styles.num, "tnum", c.kind === "transfer" && "muted")}>
                        {c.kind === "income" && c.cents > 0 ? "+" : ""}
                        {dollars(c.cents)}
                      </td>
                      <td className={cx(styles.num, "tnum sub")}>{dollars(c.usual)}</td>
                      <td className={cx(styles.num, "tnum sub")}>
                        {c.count.toLocaleString("en-AU")}
                      </td>
                      <td>
                        {c.kind === "spending" && (
                          <span className={styles.shareCell}>
                            <span className={styles.shareBar}>
                              <span
                                style={{
                                  width: `${Math.min(100, share)}%`,
                                  background: colourVar(colourOf(c)),
                                }}
                              />
                            </span>
                            <span className="tiny muted tnum">
                              {shareText(c.cents, total) || "0%"}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className={cx(styles.num, "tnum", c.rules === 0 && "muted")}>
                        {c.rules}
                      </td>
                    </tr>
                  );
                })}
                {overview.unsorted.count > 0 && (
                  <tr>
                    <td>
                      <Link href="/activity?show=check" className={styles.rowButton}>
                        <span className="sr-only">Check what isn&rsquo;t sorted yet</span>
                      </Link>
                      <span className={styles.nameLine}>
                        <span className={styles.key} style={{ background: colourVar("c-other") }} />
                        <span className="ellipsis">Not sorted yet</span>
                      </span>
                    </td>
                    <td className="small muted">To check</td>
                    <td className={cx(styles.num, "tnum")}>{dollars(overview.unsorted.cents)}</td>
                    <td className={styles.num} />
                    <td className={cx(styles.num, "tnum sub")}>
                      {overview.unsorted.count.toLocaleString("en-AU")}
                    </td>
                    <td>
                      <span className={styles.shareCell}>
                        <span className={styles.shareBar}>
                          <span
                            style={{
                              width: `${(overview.unsorted.cents / (total || 1)) * 100}%`,
                              background: colourVar("c-other"),
                            }}
                          />
                        </span>
                        <span className="tiny muted tnum">
                          {shareText(overview.unsorted.cents, total)}
                        </span>
                      </span>
                    </td>
                    <td className={styles.num} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className={styles.cardFoot}>
            <span className={cx("small muted", styles.pinNote)}>
              <Icon name="pin" size="sm" />
              <span>
                The top seven categories keep their own colour everywhere. The rest share grey. Pick
                a row to see and change it.
              </span>
            </span>
            <span className="small muted">
              Transfers are matched: same amount out and in within 3 days.
            </span>
          </div>
        </section>
      </div>

      <div className={cx(styles.side, styles.w1, styles.desktopOnly)}>
        <section
          className={cx(styles.card, styles.panel)}
          aria-label={adding ? "Add a category" : picked ? `${picked.name} details` : "Category"}
        >
          {wide && adding ? (
            <AddCategory wide onDone={done} onCancel={() => change({ add: null })} />
          ) : wide && picked ? (
            editor(picked)
          ) : null}
        </section>
      </div>

      <BottomSheet
        open={!wide && (adding || (sheet && picked !== null))}
        onClose={() => {
          setSheet(false);
          setMerging(null);
          if (adding) change({ add: null });
        }}
        title={
          adding ? "Add a category" : merging === picked?.id ? "Merge category" : "Edit category"
        }
      >
        {!wide && adding ? (
          <AddCategory wide={false} onDone={done} onCancel={() => change({ add: null })} />
        ) : !wide && picked ? (
          editor(picked)
        ) : null}
      </BottomSheet>
    </div>
  );
}

function CategoryRow({
  category,
  share,
  total,
  month,
  onPick,
}: {
  category: CategorySummary;
  share?: string;
  total?: number;
  month: string;
  onPick: (id: string) => void;
}) {
  const colour = colourVar(colourOf(category));
  const words =
    category.kind === "income" && category.cents > 0
      ? `+${dollars(category.cents)}`
      : dollars(category.cents);
  return (
    <button
      type="button"
      className={styles.catRow}
      aria-label={`Edit ${category.name}, ${words} in ${month}`}
      onClick={() => onPick(category.id)}
    >
      <span className={styles.catLine}>
        <Tile icon={iconOf(category)} size="sm" />
        <span className="grow">
          <span className={styles.nameLine}>
            <span className={styles.key} style={{ background: colour }} />
            <span className={cx("ellipsis", styles.strong)}>{category.name}</span>
          </span>
          <span className="muted small">{metaLine(category)}</span>
        </span>
        <span className={styles.amountCol}>
          <span className={cx("amt", category.kind === "transfer" && "sub")}>{words}</span>
          {category.kind === "transfer" ? (
            <span className="muted tiny">moved</span>
          ) : (
            share !== undefined && <span className="muted tiny tnum">{share}</span>
          )}
        </span>
        <Icon name="chevron-right" size="sm" />
      </span>
      {total !== undefined && category.kind === "spending" && (
        <span className={styles.rowBar} aria-hidden="true">
          <span
            style={{
              width: `${total > 0 ? Math.min(100, (category.cents / total) * 100) : 0}%`,
              background: colour,
            }}
          />
        </span>
      )}
    </button>
  );
}
