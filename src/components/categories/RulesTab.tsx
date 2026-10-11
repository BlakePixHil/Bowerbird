"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  BottomSheet,
  Button,
  ButtonLink,
  Chip,
  colourVar,
  cx,
  Icon,
  Pill,
  SegmentedControl,
  SelectField,
  Switch,
  Tag,
  TextField,
  Tile,
  useWide,
  Well,
} from "@/components/ui";
import type { CategorySummary, RuleRow, TagRef } from "@/lib/access";
import { TAG_NAME_MAX } from "@/lib/access/limits";
import { formatShortDate, type PlainDate } from "@/lib/money";
import { removeRule, updateRule } from "./actions";
import { colourOf, ruleMatch, rulesSummary, ruleWhen, transactionsText } from "./look";
import styles from "./Manage.module.css";
import { useManageParams } from "./params";

type Filter = "all" | "on" | "off";

const failed = "Couldn't save that. Check your connection and try again.";

/** The day a rule was made, in the household's time: "today", or "Sun 12 Jul". */
function madeOn(rule: RuleRow, today: PlainDate, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone }).format(rule.createdAt);
  return day === today ? "today" : formatShortDate(day);
}

/** "When the shop is Woolworths, put it in Groceries and tag it Bali 2027", as the boards set it. */
function RuleWords({ rule }: { rule: RuleRow }) {
  return (
    <span className={styles.ruleWords}>
      <span className="sub">{ruleWhen(rule)}</span>{" "}
      <span className={styles.bold}>{ruleMatch(rule)}</span>
      <span className="sub">,</span>{" "}
      <span className={styles.nowrap}>
        <span className="sub">put it in</span>{" "}
        <span className={styles.key} style={{ background: colourVar(colourOf(rule.category)) }} />{" "}
        <span className={styles.bold}>{rule.category.name}</span>
      </span>
      {rule.tag && (
        <span className={styles.nowrap}>
          {" "}
          <span className="sub">and tag it</span> <Tag icon="tag">{rule.tag.name}</Tag>
        </span>
      )}
      {rule.category.kind === "transfer" && (
        <>
          {" "}
          <Tag>Not counted</Tag>
        </>
      )}
    </span>
  );
}

function OnSwitch({ rule, onSaved }: { rule: RuleRow; onSaved: () => void }) {
  const [on, setOn] = useState(rule.enabled);
  const [busy, start] = useTransition();
  return (
    <Switch
      checked={on}
      disabled={busy}
      aria-label={`${ruleMatch(rule)} to ${rule.category.name}`}
      onChange={(event) => {
        const next = event.target.checked;
        setOn(next);
        start(async () => {
          const result = await updateRule({
            id: crypto.randomUUID(),
            ruleId: rule.id,
            enabled: next,
          }).catch(() => null);
          if (!result?.ok) setOn(!next);
          else onSaved();
        });
      }}
    >
      <span className="sr-only">On</span>
    </Switch>
  );
}

/**
 * Change where a rule puts things and the tag it adds, or delete it. New rules come from
 * transactions.
 */
function RuleEditor({
  rule,
  categories,
  tags,
  wide,
  onDone,
}: {
  rule: RuleRow;
  categories: readonly CategorySummary[];
  /** Tags the person has used, offered as they type. */
  tags: readonly TagRef[];
  wide: boolean;
  onDone: (message: string, deleted?: boolean) => void;
}) {
  const [categoryId, setCategoryId] = useState(rule.category.id);
  const [tag, setTag] = useState(rule.tag?.name ?? "");
  const tidyTag = tag.replace(/\s+/g, " ").trim();
  const tagChanged = tidyTag !== (rule.tag?.name ?? "");
  const changed = categoryId !== rule.category.id || tagChanged;
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, start] = useTransition();
  const target = categories.find((c) => c.id === categoryId);

  function save() {
    setError(null);
    start(async () => {
      const result = await updateRule({
        id: crypto.randomUUID(),
        ruleId: rule.id,
        categoryId,
        ...(tagChanged ? { tag: tidyTag } : {}),
      }).catch(() => null);
      if (!result?.ok) setError(result?.error ?? failed);
      else
        onDone(
          `New ${ruleMatch(rule)} transactions now go in ${target?.name ?? "it"}${
            tidyTag ? ` and get the ${tidyTag} tag` : ""
          }.`,
        );
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const result = await removeRule({ id: crypto.randomUUID(), ruleId: rule.id }).catch(
        () => null,
      );
      if (!result?.ok) setError(result?.error ?? failed);
      else onDone(`The ${ruleMatch(rule)} rule is deleted.`, true);
    });
  }

  return (
    <form
      className={styles.editor}
      aria-label={`Rule for ${ruleMatch(rule)}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (changed && !busy) save();
      }}
    >
      {wide && <h2 className="h2">Rule</h2>}
      <p className={styles.ruleSentence}>
        <RuleWords rule={rule} />
      </p>
      <SelectField
        label="Put it in"
        value={categoryId}
        onChange={(event) => setCategoryId(event.target.value)}
        options={categories.map((c) => ({ value: c.id, label: c.name }))}
        hint="Only new transactions follow the change. Ones already sorted stay where they are."
      />
      <TextField
        label="And tag it"
        icon="tag"
        value={tag}
        maxLength={TAG_NAME_MAX}
        placeholder="No tag"
        list={`rule-tags-${rule.id}`}
        onChange={(event) => setTag(event.target.value)}
        hint="Optional. A tag such as a trip groups spending across categories."
      />
      <datalist id={`rule-tags-${rule.id}`}>
        {tags.map((t) => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>
      <div className={styles.dangerRows}>
        {confirm ? (
          <div className={styles.confirm} role="group" aria-label="Delete this rule">
            <span className="small">
              Delete the {ruleMatch(rule)} rule? What it sorted stays sorted.
            </span>
            <div className={styles.confirmButtons}>
              <Button onClick={() => setConfirm(false)} disabled={busy}>
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
            onClick={() => setConfirm(true)}
            disabled={busy}
          >
            <Icon name="trash" />
            <span className="grow">Delete rule</span>
          </button>
        )}
      </div>
      <div role="status" className={styles.status}>
        {error && (
          <Pill tone="crit" className={styles.statusPill}>
            {error}
          </Pill>
        )}
      </div>
      <div className={styles.editorButtons}>
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

const howTo = (
  <>Make a rule from any transaction: pick a category, then &ldquo;Yes, always&rdquo;.</>
);

/**
 * The Rules part of Categories and rules: every rule in words with its switch, busiest first.
 * There's no blank form: a rule starts from a transaction, so the page says how.
 */
export function RulesTab({
  rules,
  categories,
  tags,
  today,
  timeZone,
}: {
  rules: readonly RuleRow[];
  categories: readonly CategorySummary[];
  tags: readonly TagRef[];
  today: PlainDate;
  timeZone: string;
}) {
  const router = useRouter();
  const wide = useWide();
  const { rule: pickedId, ruleFor, change } = useManageParams();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const forCategory = categories.find((c) => c.id === ruleFor) ?? null;
  const on = rules.filter((rule) => rule.enabled).length;
  const words = search.trim().toLowerCase();
  const shown = rules.filter(
    (rule) =>
      (filter === "all" || rule.enabled === (filter === "on")) &&
      (!forCategory || rule.category.id === forCategory.id) &&
      (!words || ruleMatch(rule).toLowerCase().includes(words)),
  );
  const picked = rules.find((rule) => rule.id === pickedId) ?? null;
  const counts: Record<Filter, number> = { all: rules.length, on, off: rules.length - on };
  const options = (["all", "on", "off"] as const).map((value) => ({
    value,
    label: `${value === "all" ? "All" : value === "on" ? "On" : "Off"} ${counts[value]}`,
  }));

  function pick(id: string) {
    change({ rule: id });
    setNotice(null);
    if (!wide) setSheet(true);
  }

  function done(message: string, deleted = false) {
    setNotice(message);
    setSheet(false);
    if (deleted) change({ rule: null });
    router.refresh();
  }

  const empty =
    rules.length === 0
      ? "No rules yet."
      : filter === "off" && !forCategory && !words
        ? "No rules are off. Every rule is sorting for you."
        : filter === "on" && !forCategory && !words
          ? "Every rule is off. Turn one on to start sorting again."
          : "No rules match. Try another filter.";

  const meta = (rule: RuleRow) =>
    `Sorted ${rule.sorted.toLocaleString("en-AU")} · made ${madeOn(rule, today, timeZone)}${rule.enabled ? "" : " · off"}`;

  return (
    <div className={styles.flow}>
      <div className={cx(styles.main, styles.w2)}>
        <div role="status" className={styles.notice}>
          {notice && (
            <Pill tone="good" className={styles.statusPill}>
              {notice}
            </Pill>
          )}
        </div>

        {/* Phone */}
        <div className={styles.phoneOnly}>
          <section className={cx(styles.card, styles.summary)} aria-label="Rules">
            <div className={styles.rulesHead}>
              <Tile icon="wand" tone="accent" />
              <div className="grow">
                <div className={styles.bold}>
                  {rules.length === 0
                    ? "No rules yet"
                    : on === rules.length
                      ? `${rules.length} ${rules.length === 1 ? "rule" : "rules"}, all on`
                      : `${on} of ${rules.length} rules on`}
                </div>
                <div className="muted small">
                  {rules.length > 0
                    ? `They've sorted ${transactionsText(rules.reduce((s, r) => s + r.sorted, 0))} for you`
                    : "They sort new transactions for you"}
                </div>
              </div>
            </div>
            <p className={cx("sub small", styles.note)}>
              A rule starts when you pick &ldquo;Yes, always&rdquo; on a transaction. New ones from
              that shop are sorted for you. Turn one off to pause it without losing it.
            </p>
          </section>
          <div className={styles.chipRow} role="group" aria-label="Show rules">
            {(["all", "on", "off"] as const).map((value) => (
              <Chip key={value} on={filter === value} onClick={() => setFilter(value)}>
                {value === "all" ? "All" : value === "on" ? "On" : "Off"}{" "}
                <span className="tnum muted">{counts[value]}</span>
              </Chip>
            ))}
            {forCategory && (
              <Chip
                on
                onClick={() => change({ for: null })}
                aria-label={`Showing ${forCategory.name} only. Show every category`}
              >
                <span
                  className={styles.key}
                  style={{ background: colourVar(colourOf(forCategory)) }}
                />
                {forCategory.name}
                <Icon name="close" size="sm" />
              </Chip>
            )}
          </div>
          <section className={cx(styles.card, styles.rows)} aria-label="Rules">
            {shown.map((rule) => (
              <div key={rule.id} className={cx(styles.ruleRow, !rule.enabled && styles.off)}>
                <button
                  type="button"
                  className={styles.ruleButton}
                  onClick={() => pick(rule.id)}
                  aria-label={`Change the ${ruleMatch(rule)} rule`}
                >
                  <RuleWords rule={rule} />
                  <span className={cx("muted small tnum", styles.ruleMeta)}>
                    {meta(rule)}
                    {madeOn(rule, today, timeZone) === "today" && (
                      <Pill tone="accent" className={styles.newPill}>
                        New
                      </Pill>
                    )}
                  </span>
                </button>
                <OnSwitch
                  key={`${rule.id}|${rule.enabled}`}
                  rule={rule}
                  onSaved={() => router.refresh()}
                />
              </div>
            ))}
            {shown.length === 0 && <div className={cx("muted small", styles.empty)}>{empty}</div>}
          </section>
          <div className={styles.hint}>
            <Icon name="wand" size="sm" />
            <span className="muted small">{howTo}</span>
          </div>
        </div>

        {/* Desktop */}
        <section className={cx(styles.card, styles.desktopOnly)} aria-labelledby="rules-title">
          <div className={styles.cardHead}>
            <div className={styles.cardTitle}>
              <h2 id="rules-title" className="h2">
                Rules
              </h2>
              <span className="muted small tnum">{rulesSummary(rules)}</span>
            </div>
          </div>
          <div className={styles.toolbar}>
            <SegmentedControl
              label="Show rules that are"
              options={options}
              value={filter}
              onChange={setFilter}
              size="sm"
            />
            {forCategory && (
              <Chip
                on
                onClick={() => change({ for: null })}
                aria-label={`Showing ${forCategory.name} only. Show every category`}
              >
                <span
                  className={styles.key}
                  style={{ background: colourVar(colourOf(forCategory)) }}
                />
                {forCategory.name}
                <Icon name="close" size="sm" />
              </Chip>
            )}
            <label className={styles.find}>
              <Icon name="search" size="sm" />
              <input
                type="search"
                placeholder="Find a shop"
                aria-label="Find a rule by shop"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>
          <div className={styles.scrollX}>
            <table className={styles.table} aria-label="Rules">
              <thead>
                <tr>
                  <th scope="col">Rule</th>
                  <th scope="col" className={styles.num}>
                    Sorted
                  </th>
                  <th scope="col">Made</th>
                  <th scope="col" className={styles.num}>
                    On
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((rule) => {
                  const made = madeOn(rule, today, timeZone);
                  return (
                    <tr
                      key={rule.id}
                      className={cx(
                        picked?.id === rule.id && styles.pickedRow,
                        !rule.enabled && styles.off,
                      )}
                    >
                      <td>
                        <button
                          type="button"
                          className={styles.rowButton}
                          aria-pressed={picked?.id === rule.id}
                          aria-label={`Change the ${ruleMatch(rule)} rule`}
                          onClick={() => pick(rule.id)}
                        />
                        <RuleWords rule={rule} />
                        {made === "today" && (
                          <Pill tone="accent" className={styles.newPill}>
                            New
                          </Pill>
                        )}
                      </td>
                      <td className={cx(styles.num, "tnum")}>
                        {rule.sorted.toLocaleString("en-AU")}
                      </td>
                      <td className="sub small">{made === "today" ? "Today" : made}</td>
                      <td className={cx(styles.num, styles.above)}>
                        <OnSwitch
                          key={`${rule.id}|${rule.enabled}`}
                          rule={rule}
                          onSaved={() => router.refresh()}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && <div className={cx("muted small", styles.empty)}>{empty}</div>}
          </div>
          <div className={styles.cardFoot}>
            <span className="small muted">{howTo}</span>
            <Link href="/activity" className={styles.link}>
              Open Activity
            </Link>
          </div>
        </section>
      </div>

      <div className={cx(styles.side, styles.w1, styles.desktopOnly)}>
        <section className={cx(styles.card, styles.panel)} aria-label="Rule">
          {wide && picked ? (
            <RuleEditor
              key={`${picked.id}|${picked.category.id}|${picked.tag?.id}`}
              rule={picked}
              categories={categories}
              tags={tags}
              wide
              onDone={done}
            />
          ) : (
            <div className={styles.editor}>
              <h2 className="h2">Rules come from transactions</h2>
              <p className={cx("muted small", styles.note)}>
                Pick a category on any transaction and you&rsquo;re asked whether to always sort
                that shop the same way. Say &ldquo;Yes, always&rdquo; and new ones are sorted for
                you, with the option to change earlier ones too.
              </p>
              <Well className={styles.kindNote}>
                <Icon name="wand" size="sm" />
                <span className="sub small">
                  Pick a rule to change where it puts things, or delete it.
                </span>
              </Well>
              <ButtonLink href="/activity" icon="list">
                Open Activity
              </ButtonLink>
            </div>
          )}
        </section>
      </div>

      <BottomSheet
        open={!wide && sheet && picked !== null}
        onClose={() => setSheet(false)}
        title="Rule"
      >
        {!wide && picked && (
          <RuleEditor
            key={`${picked.id}|${picked.category.id}|${picked.tag?.id}`}
            rule={picked}
            categories={categories}
            tags={tags}
            wide={false}
            onDone={done}
          />
        )}
      </BottomSheet>
    </div>
  );
}
