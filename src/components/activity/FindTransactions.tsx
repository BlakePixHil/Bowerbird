"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  use,
  useEffect,
  useEffectEvent,
  useId,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  Avatar,
  BottomSheet,
  Button,
  Checkbox,
  Chip,
  colourVar,
  cx,
  Icon,
  IconButton,
  Pill,
  SegmentedControl,
  Switch,
  TextField,
  useWide,
  type IconName,
} from "@/components/ui";
import type { SavedView } from "@/lib/access";
import {
  ANYTHING,
  DATE_RANGES,
  type DateRange,
  type Direction,
  type Find,
} from "@/lib/access/find";
import { VIEW_NAME_MAX } from "@/lib/access/limits";
import { addMonths, parseMoney, type PlainDate } from "@/lib/money";
import { categoryColour } from "@/lib/sorting/colour";
import styles from "./Activity.module.css";
import { countFound, forgetView, saveFilters } from "./actions";
import { filtersKey, isAnything, RANGE_LABELS, rangeText, viewName, type FindLists } from "./find";
import { whoseLook, type People } from "./look";
import { activityHref, MAX_SEARCH, parseSearch, type Show } from "./show";

const failed = "Couldn't save that. Check your connection and try again.";

const tidyName = (name: string) => name.replace(/\s+/g, " ").trim();

// Open and closed --------------------------------------------------------------------------------

type Opening = { open: boolean; opened: number; setOpen: (open: boolean) => void };

const FindOpen = createContext<Opening | null>(null);

function useOpening(): Opening {
  const opening = use(FindOpen);
  if (!opening) throw new Error("Wrap Activity in FindProvider");
  return opening;
}

/** Keeps whether the filters are open, for the header's Filters button and the sheet or panel. */
export function FindProvider({ children }: { children: ReactNode }) {
  const [open, setOpenNow] = useState(false);
  // Each opening starts from the filters in use, so changes that weren't shown are dropped.
  const [opened, setOpened] = useState(0);
  const setOpen = (next: boolean) => {
    if (next && !open) setOpened((n) => n + 1);
    setOpenNow(next);
  };
  return <FindOpen value={{ open, opened, setOpen }}>{children}</FindOpen>;
}

/** Filters in the header: an icon on a phone, a button with how many are in use on desktop. */
export function FiltersButton({ place, count }: { place: "phone" | "desktop"; count: number }) {
  const { open, setOpen } = useOpening();
  const label = count > 0 ? `Filters, ${count} in use` : "Filters";
  if (place === "phone")
    return (
      <span className={styles.filterIcon}>
        <IconButton icon="filter" label={label} onClick={() => setOpen(true)} />
        {count > 0 && (
          <span className={styles.filterDot} aria-hidden="true">
            {count}
          </span>
        )}
      </span>
    );
  return (
    <Button
      icon="filter"
      aria-expanded={open}
      aria-controls="find-panel"
      aria-label={label}
      className={cx(styles.filtersButton, open && styles.filtersOpen)}
      onClick={() => setOpen(!open)}
    >
      <span>Filters</span>
      {count > 0 && (
        <Pill tone="accent" icon={null} className={styles.filterCount}>
          {count}
        </Pill>
      )}
    </Button>
  );
}

// The sheet and the panel ------------------------------------------------------------------------

export type FindProps = {
  show: Show;
  search: string;
  find: Find;
  /** How many rows the filters in use match. */
  total: number;
  today: PlainDate;
  lists: FindLists;
  people: People;
  /** Whether Mine would narrow anything: the viewer sees accounts that aren't only theirs. */
  offerMine: boolean;
  views: readonly SavedView[];
};

/**
 * Find transactions, from its boards: a sheet on a phone and a panel over the list on desktop.
 * Choices are a draft with a live count until Show, and can be saved as a view.
 */
export function FindTransactions(props: FindProps) {
  const { open, opened, setOpen } = useOpening();
  const wide = useWide();
  if (wide)
    return open ? <FindPanel key={opened} {...props} onClose={() => setOpen(false)} /> : null;
  return <FindSheet key={opened} {...props} open={open} onClose={() => setOpen(false)} />;
}

function FindSheet({
  open,
  onClose,
  ...props
}: FindProps & { open: boolean; onClose: () => void }) {
  const draft = useDraft(props, onClose);
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Find transactions"
      footer={<ShowButtons draft={draft} />}
    >
      <TextField
        label="Search shop, note or amount"
        hideLabel
        icon="search"
        type="search"
        placeholder="Search shop, note or amount"
        value={draft.search}
        maxLength={MAX_SEARCH}
        enterKeyHint="search"
        autoComplete="off"
        onChange={(event) => draft.setSearch(event.target.value)}
      />
      <Fields draft={draft} props={props} />
      <SaveRow draft={draft} place="sheet" />
    </BottomSheet>
  );
}

function FindPanel({ onClose, ...props }: FindProps & { onClose: () => void }) {
  const draft = useDraft(props, onClose);
  const n = draft.count;
  return (
    <section id="find-panel" className={styles.findPanel} aria-labelledby="find-title">
      <div className={styles.findHead}>
        <h2 id="find-title" className="h2">
          Find transactions
        </h2>
        <span className="muted small tnum" role="status">
          {n === null
            ? "Counting…"
            : `${n.toLocaleString("en-AU")} ${n === 1 ? "transaction matches" : "transactions match"}`}
        </span>
        <IconButton icon="close" label="Close filters" boxed onClick={onClose} />
      </div>
      <Fields draft={draft} props={props} />
      <div className={styles.findFoot}>
        <SaveRow draft={draft} place="panel" />
        <ShowButtons draft={draft} />
      </div>
    </section>
  );
}

// The draft --------------------------------------------------------------------------------------

/** "50", "12.50", for an amount field. */
const amountField = (cents: number | null) =>
  cents === null ? "" : cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);

const centsFrom = (text: string) => {
  const cents = text.trim() ? parseMoney(text.replace(/^\$/, "")) : null;
  return cents === null ? null : Math.abs(cents);
};

type Draft = ReturnType<typeof useDraft>;

function useDraft(props: FindProps, onDone: () => void) {
  const router = useRouter();
  const [search, setSearch] = useState(props.search);
  const [find, setFind] = useState(props.find);
  const [minText, setMinText] = useState(amountField(props.find.min));
  const [maxText, setMaxText] = useState(amountField(props.find.max));
  const [counted, setCounted] = useState<{ key: string; n: number } | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ key: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const filters = { search: parseSearch(search), find };
  const key = filtersKey(filters);
  const shownKey = filtersKey({ search: props.search, find: props.find });
  const count = key === shownKey ? props.total : counted?.key === key ? counted.n : null;
  const current = props.views.find((view) => filtersKey(view.filters) === key);

  const countNow = useEffectEvent(async (asked: string) => {
    const n = await countFound({ show: props.show, search: filters.search, find }).catch(
      () => null,
    );
    if (n !== null) setCounted({ key: asked, n });
  });
  useEffect(() => {
    if (key === shownKey) return;
    const timer = setTimeout(() => void countNow(key), 250);
    return () => clearTimeout(timer);
  }, [key, shownKey]);

  const change = (next: Partial<Find>) => {
    setFind((now) => ({ ...now, ...next }));
    setNaming(null);
    setError(null);
  };

  return {
    props,
    search,
    find,
    minText,
    maxText,
    count,
    naming,
    error,
    busy,
    savedName: current?.name ?? (saved?.key === key ? saved.name : null),
    current,
    empty: isAnything(find) && !filters.search,
    setSearch: (text: string) => {
      setSearch(text);
      setNaming(null);
    },
    change,
    setMin: (text: string) => {
      setMinText(text);
      change({ min: centsFrom(text) });
    },
    setMax: (text: string) => {
      setMaxText(text);
      change({ max: centsFrom(text) });
    },
    clear: () => {
      setFind(ANYTHING);
      setSearch("");
      setMinText("");
      setMaxText("");
      setNaming(null);
      setError(null);
    },
    show: () => {
      onDone();
      start(() =>
        router.replace(activityHref(props.show, filters.search, find), { scroll: false }),
      );
    },
    startNaming: () => setNaming(viewName(filters, props.lists, props.today)),
    setNaming,
    save: (name: string) => {
      setError(null);
      start(async () => {
        const result = await saveFilters({ name, ...filters }).catch(() => null);
        if (!result?.ok) {
          setError(result?.error ?? failed);
          return;
        }
        setSaved({ key, name: result.view.name });
        setNaming(null);
        router.refresh();
      });
    },
    forget: (id: string) => {
      setError(null);
      start(async () => {
        const result = await forgetView(id).catch(() => null);
        if (!result?.ok) {
          setError(result?.error ?? failed);
          return;
        }
        setSaved(null);
        router.refresh();
      });
    },
  };
}

// The fields -------------------------------------------------------------------------------------

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={styles.findGroup}>
      <div className={styles.findGroupHead}>
        <span id={id} className="h3">
          {title}
        </span>
        {hint && <span className="muted small tnum">{hint}</span>}
      </div>
      <div role="group" aria-labelledby={id}>
        {children}
      </div>
    </div>
  );
}

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: "both", label: "In and out" },
  { value: "in", label: "Money in" },
  { value: "out", label: "Money out" },
];

function Fields({ draft, props }: { draft: Draft; props: FindProps }) {
  const { find, change } = draft;
  const { lists, people, today } = props;
  const accounts = lists.accounts;
  const ticked = (id: string) => find.accounts === null || find.accounts.includes(id);
  const off = accounts.filter((account) => !ticked(account.id)).length;
  const picked = find.categories.length;

  function flipAccount(id: string) {
    const now = accounts.filter((a) => ticked(a.id)).map((a) => a.id);
    const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
    change({ accounts: next.length === accounts.length ? null : next });
  }
  const flip = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  function pickRange(range: DateRange) {
    if (find.range === range) return change({ range: null, from: null, to: null });
    if (range !== "custom") return change({ range, from: null, to: null });
    // Custom starts from last month to today, as on the board, ready to change.
    change({ range, from: addMonths(today, -1, 1), to: today });
  }

  return (
    <div className={styles.findBody}>
      <div className={styles.findCol}>
        {props.offerMine && (
          <Group title="Whose" hint={find.mine ? "Only yours" : "Everyone"}>
            <div className={styles.findChips}>
              <Chip
                on={find.mine}
                className={styles.avatarChip}
                onClick={() => change({ mine: !find.mine })}
              >
                <span aria-hidden="true" className={styles.chipAvatar}>
                  <Avatar size="sm" {...whoseLook("mine", people)} />
                </span>
                <span>Mine</span>
              </Chip>
            </div>
          </Group>
        )}
        {accounts.length > 1 && (
          <Group
            title="Accounts"
            hint={
              off > 0 ? (
                <button
                  type="button"
                  className={styles.pickAll}
                  onClick={() => change({ accounts: null })}
                >
                  Pick all {accounts.length}
                </button>
              ) : (
                `All ${accounts.length}`
              )
            }
          >
            <div className={styles.findAccounts}>
              {accounts.map((account) => {
                const look = whoseLook(account.whose, people);
                return (
                  <Checkbox
                    key={account.id}
                    className={styles.findAccount}
                    checked={ticked(account.id)}
                    onChange={() => flipAccount(account.id)}
                  >
                    <span className={styles.findAccountName}>
                      <span className={styles.clip}>{account.name}</span>
                      <span className="muted small">{whoseWords(account.whose, people)}</span>
                    </span>
                    <Avatar size="sm" {...look} />
                  </Checkbox>
                );
              })}
            </div>
          </Group>
        )}
      </div>

      <div className={styles.findCol}>
        <Group title="Categories" hint={picked > 0 ? `${picked} picked` : "Any category"}>
          <div className={styles.findChips}>
            {lists.categories.map((category) => (
              <Chip
                key={category.id}
                on={find.categories.includes(category.id)}
                className={styles.findChip}
                onClick={() => change({ categories: flip(find.categories, category.id) })}
              >
                <span
                  className={styles.key}
                  style={{ background: colourVar(categoryColour(category)) }}
                />
                {category.name}
              </Chip>
            ))}
          </div>
        </Group>
        {lists.tags.length > 0 && (
          <Group
            title="Tags"
            hint={find.tags.length > 0 ? `${find.tags.length} picked` : "Any tag"}
          >
            <div className={styles.findChips}>
              {lists.tags.map((tag) => (
                <Chip
                  key={tag.id}
                  icon="tag"
                  on={find.tags.includes(tag.id)}
                  className={styles.findChip}
                  onClick={() => change({ tags: flip(find.tags, tag.id) })}
                >
                  {tag.name}
                </Chip>
              ))}
            </div>
          </Group>
        )}
      </div>

      <div className={styles.findCol}>
        <Group title="Date range" hint={rangeText(find, today)}>
          <div className={styles.rangeSeg}>
            {DATE_RANGES.map((range) => (
              <button
                key={range}
                type="button"
                aria-pressed={find.range === range}
                className={cx(styles.rangeButton, "hit")}
                onClick={() => pickRange(range)}
              >
                {RANGE_LABELS[range]}
              </button>
            ))}
          </div>
          {find.range === "custom" && (
            <div className={styles.findPair}>
              <TextField
                label="From"
                type="date"
                value={find.from ?? ""}
                max={find.to ?? undefined}
                onChange={(event) => change({ from: event.target.value || null })}
              />
              <TextField
                label="To"
                type="date"
                value={find.to ?? ""}
                min={find.from ?? undefined}
                onChange={(event) => change({ to: event.target.value || null })}
              />
            </div>
          )}
        </Group>
        <Group title="Amount">
          <div className={styles.findPair}>
            <AmountField
              label="From $"
              aria="Amount from, in dollars"
              text={draft.minText}
              bad={draft.minText.trim() !== "" && find.min === null}
              onChange={draft.setMin}
            />
            <AmountField
              label="To $"
              aria="Amount to, in dollars"
              text={draft.maxText}
              bad={draft.maxText.trim() !== "" && find.max === null}
              onChange={draft.setMax}
            />
          </div>
          <SegmentedControl
            label="Money in or out"
            options={DIRECTIONS}
            value={find.direction}
            onChange={(direction) => change({ direction })}
            className={styles.findDirection}
          />
        </Group>
        <div className={styles.findSwitches}>
          <FindSwitch
            icon="transfer"
            title="Not counted (transfers)"
            sub="Moves between your own accounts"
            on={find.transfers}
            onChange={(transfers) => change({ transfers })}
          />
          <FindSwitch
            icon="clock"
            title="Pending"
            sub="Not settled by the bank yet"
            on={find.pending}
            onChange={(pending) => change({ pending })}
          />
        </div>
      </div>
    </div>
  );
}

function whoseWords(whose: FindLists["accounts"][number]["whose"], people: People): string {
  if (whose === "shared") return "Joint";
  if (whose === "partner") return `${people.partner?.name ?? "Partner"}’s`;
  return "Yours";
}

function AmountField({
  label,
  aria,
  text,
  bad,
  onChange,
}: {
  label: string;
  aria: string;
  text: string;
  bad: boolean;
  onChange: (text: string) => void;
}) {
  return (
    <label className={cx(styles.amountField, bad && styles.amountBad)}>
      <span className="small muted">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="Any"
        aria-label={aria}
        aria-invalid={bad || undefined}
        value={text}
        maxLength={12}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function FindSwitch({
  icon,
  title,
  sub,
  on,
  onChange,
}: {
  icon: IconName;
  title: string;
  sub: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <Switch
      className={styles.findSwitch}
      checked={on}
      onChange={(event) => onChange(event.target.checked)}
    >
      <span className={styles.findSwitchWords}>
        <Icon name={icon} />
        <span>
          <span className={styles.findSwitchTitle}>{title}</span>
          <span className="muted small">{sub}</span>
        </span>
      </span>
    </Switch>
  );
}

// Saving and showing -----------------------------------------------------------------------------

function SaveRow({ draft, place }: { draft: Draft; place: "sheet" | "panel" }) {
  const { naming, savedName, current, busy } = draft;
  if (naming !== null)
    return (
      <form
        className={styles.saveForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (naming.trim() && !busy) draft.save(naming);
        }}
      >
        <TextField
          label="Name this view"
          icon="bookmark"
          value={naming}
          maxLength={VIEW_NAME_MAX}
          autoFocus
          onChange={(event) => draft.setNaming(event.target.value)}
          hint={
            draft.props.views.some(
              (view) => view.name.toLowerCase() === tidyName(naming).toLowerCase(),
            )
              ? "You have a view with this name. Saving replaces it."
              : undefined
          }
          error={draft.error ?? undefined}
        />
        <div className={styles.saveButtons}>
          <Button disabled={busy} onClick={() => draft.setNaming(null)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !naming.trim()}>
            Save view
          </Button>
        </div>
      </form>
    );
  if (savedName)
    return (
      <div className={styles.savedRow}>
        <Pill tone="good" className={styles.savedPill}>
          <span role="status">
            Saved as a view called &ldquo;{savedName}&rdquo;
            {place === "sheet" && ". It sits with the chips at the top of Activity."}
          </span>
        </Pill>
        {current && (
          <Button
            variant="ghost"
            icon="trash"
            disabled={busy}
            onClick={() => draft.forget(current.id)}
          >
            Remove view
          </Button>
        )}
        {draft.error && (
          <Pill tone="crit">
            <span role="alert">{draft.error}</span>
          </Pill>
        )}
      </div>
    );
  return (
    <button
      type="button"
      className={cx(styles.saveFilters, place === "panel" && styles.saveFiltersPanel)}
      disabled={draft.empty}
      onClick={draft.startNaming}
    >
      <Icon name="bookmark" size={place === "panel" ? "sm" : undefined} />
      <span className={styles.saveWords}>
        <span className={styles.saveTitle}>Save these filters</span>
        {place === "sheet" && (
          <span className="muted small">
            {draft.empty
              ? "Pick a filter or search first"
              : "Keep them as a view at the top of Activity"}
          </span>
        )}
      </span>
      {place === "sheet" && <Icon name="chevron-right" size="sm" />}
    </button>
  );
}

function ShowButtons({ draft }: { draft: Draft }) {
  const n = draft.count;
  return (
    <div className={styles.showButtons}>
      <Button size="lg" onClick={draft.clear} disabled={draft.empty}>
        Clear
      </Button>
      {n === 0 ? (
        <Button size="lg" disabled>
          No transactions match
        </Button>
      ) : (
        <Button size="lg" variant="primary" onClick={draft.show}>
          {n === null
            ? "Show transactions"
            : `Show ${n.toLocaleString("en-AU")} transaction${n === 1 ? "" : "s"}`}
        </Button>
      )}
    </div>
  );
}
