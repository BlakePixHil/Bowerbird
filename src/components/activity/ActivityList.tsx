"use client";

import { useRouter } from "next/navigation";
import {
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Avatar,
  BottomSheet,
  Button,
  ButtonLink,
  colourVar,
  cx,
  IconButton,
  Tag,
  Tile,
  useWide,
  WIDE,
} from "@/components/ui";
import type { ActivityPage, ActivityRow, CategoryChoice, TagRef } from "@/lib/access";
import type { Find } from "@/lib/access/find";
import { formatShortDate, type PlainDate } from "@/lib/money";
import { categoryColour } from "@/lib/sorting/colour";
import styles from "./Activity.module.css";
import { moreActivity } from "./actions";
import {
  byDay,
  categoryLabel,
  dayLabel,
  dayTotal,
  rowAmount,
  rowIcon,
  rowLabel,
  whoseLook,
  type People,
} from "./look";
import { activityHref, type Show } from "./show";
import type { RowsChanged } from "./Categorise";
import { TransactionDetail } from "./TransactionDetail";

type ActivityListProps = {
  first: ActivityPage;
  show: Show;
  search: string;
  find: Find;
  /** "Filtered by" and its chips, when any filters are in use. */
  filteredBy: ReactNode;
  /** Where Clear filters goes, when any filters are in use. */
  clearFilters: string | null;
  /** How many rows match, across every page. */
  total: number;
  today: PlainDate;
  people: People;
  /** The household's categories, for the grid in the transaction sheet. */
  categories: readonly CategoryChoice[];
  /** Tags the person has used, for the sheet's quick picks. */
  tagChoices: readonly TagRef[];
  /** Under the list on a phone: "Missing something?". */
  footer: ReactNode;
  /** Under the transaction panel on desktop. */
  side: ReactNode;
};

/**
 * Every transaction, newest first, grouped by day. On a phone each day is a card of rows and a tap
 * opens the transaction sheet. On desktop the same rows line up as a table, and the picked row
 * shows in a panel at the side. Earlier days load as the list nears its end.
 */
export function ActivityList({
  first,
  show,
  search,
  find,
  filteredBy,
  clearFilters,
  total,
  today,
  people,
  categories,
  tagChoices,
  footer,
  side,
}: ActivityListProps) {
  // Days, not rows, so each page's days keep their identity and only new days render on append.
  const [days, setDays] = useState(() => byDay(first.rows));
  const [next, setNext] = useState(first.next);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(first.rows[0]?.id ?? null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const busy = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const wide = useWide();
  const router = useRouter();

  async function loadMore() {
    if (!next || busy.current) return;
    busy.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const page = await moreActivity({ show, search, find }, next);
      setDays((shown) => [...shown, ...byDay(page.rows)]);
      setNext(page.next);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  const onNearEnd = useEffectEvent(() => void loadMore());
  useEffect(() => {
    const target = end.current;
    if (!target || !next || failed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onNearEnd();
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [next, failed]);

  const rows = useMemo(() => days.flatMap((day) => day.rows), [days]);
  const index = Math.max(
    0,
    rows.findIndex((row) => row.id === picked),
  );
  const current = rows[index] ?? null;

  // A change shows on every loaded row it moved, and on every row of that category, since its
  // colour may be new. The page then refreshes for the counts and totals.
  const changeRows = useCallback(
    ({ ids, category, paired }: RowsChanged) => {
      const moved = new Set(ids);
      const look = (row: ActivityRow): ActivityRow => {
        if (moved.has(row.id)) {
          const pair = paired ?? row.paired;
          // One category for the whole row takes any split away.
          return {
            ...row,
            category,
            parts: [],
            paired: pair,
            notCounted: pair || category?.kind === "transfer",
          };
        }
        return category && row.category?.id === category.id ? { ...row, category } : row;
      };
      setDays((shown) =>
        shown.map((day) => {
          const rows = day.rows.map(look);
          return rows.some((row, i) => row !== day.rows[i]) ? { ...day, rows } : day;
        }),
      );
      router.refresh();
    },
    [router],
  );

  // One row's own details changed: its parts, tags or note.
  const changeRow = useCallback(
    (next: ActivityRow) => {
      setDays((shown) =>
        shown.map((day) =>
          day.date === next.date
            ? { ...day, rows: day.rows.map((row) => (row.id === next.id ? next : row)) }
            : day,
        ),
      );
      router.refresh();
    },
    [router],
  );

  const pick = useCallback((id: string) => {
    setPicked(id);
    if (!window.matchMedia(WIDE).matches) setSheetOpen(true);
  }, []);

  if (rows.length === 0) {
    return (
      <div className={styles.flow}>
        <section className={cx(styles.list, styles.w2)} aria-label="Transactions">
          {filteredBy}
          <NoMatch show={show} search={search} find={find} clearFilters={clearFilters} />
        </section>
        <div className={cx(styles.side, styles.w1)}>{side}</div>
        <div className={styles.phoneOnly}>{footer}</div>
      </div>
    );
  }

  const range =
    days.length > 0
      ? `Showing ${formatShortDate(days.at(-1)!.date)} to ${formatShortDate(days[0].date)}`
      : "";

  return (
    <div className={styles.flow}>
      <section className={cx(styles.list, styles.w2)} aria-labelledby="transactions-title">
        <div className={styles.listHead}>
          <h2 id="transactions-title" className="h2">
            Transactions
          </h2>
          <span className="muted small tnum">
            {total.toLocaleString("en-AU")} {search || clearFilters ? "found" : "shown"}
          </span>
          <span className={cx("muted small", styles.order)}>Newest first</span>
        </div>
        {filteredBy}
        <div className={styles.columns} aria-hidden="true">
          <span>What</span>
          <span>Category</span>
          <span>Account</span>
          <span>Whose</span>
          <span className={styles.right}>Amount</span>
        </div>

        {days.map((day) => (
          <DayGroup
            key={day.date}
            day={day}
            today={today}
            people={people}
            wide={wide}
            picked={wide && current?.date === day.date ? current.id : null}
            onPick={pick}
          />
        ))}

        <div ref={end} className={styles.listFoot}>
          <span className="small muted" role="status">
            {loading ? "Loading earlier days…" : failed ? "Couldn't load earlier days." : range}
          </span>
          {next && !loading && (
            <Button variant="ghost" onClick={() => void loadMore()}>
              {failed ? "Try again" : "Show earlier days"}
            </Button>
          )}
        </div>
      </section>

      <div className={cx(styles.side, styles.w1)}>
        {current && (
          <section className={styles.panel} aria-label={`${current.shop} transaction`}>
            <div className={styles.panelHead}>
              <span className="small sub">
                Transaction{" "}
                <span className="muted tnum">
                  · {(index + 1).toLocaleString("en-AU")} of {total.toLocaleString("en-AU")}
                </span>
              </span>
              <div className={styles.panelNav}>
                <IconButton
                  icon="chevron-up"
                  label="Previous transaction"
                  boxed
                  disabled={index === 0}
                  onClick={() => setPicked(rows[index - 1]?.id ?? picked)}
                />
                <IconButton
                  icon="chevron-down"
                  label="Next transaction"
                  boxed
                  disabled={index === rows.length - 1}
                  onClick={() => {
                    setPicked(rows[index + 1]?.id ?? picked);
                    if (index + 5 >= rows.length) void loadMore();
                  }}
                />
              </div>
            </div>
            <TransactionDetail
              key={current.id}
              row={current}
              people={people}
              categories={categories}
              tagChoices={tagChoices}
              onChanged={changeRows}
              onRowChanged={changeRow}
            />
          </section>
        )}
        {side}
      </div>

      <div className={styles.phoneOnly}>{footer}</div>

      <BottomSheet
        open={sheetOpen && !wide && current !== null}
        onClose={() => {
          setSheetOpen(false);
          setSplitting(false);
        }}
        title={splitting ? "Split transaction" : "Transaction"}
      >
        {current && !wide && (
          <TransactionDetail
            key={`${current.id}|${sheetOpen}`}
            row={current}
            people={people}
            categories={categories}
            tagChoices={tagChoices}
            onChanged={changeRows}
            onRowChanged={changeRow}
            onSplitting={setSplitting}
          />
        )}
      </BottomSheet>
    </div>
  );
}

/**
 * One day: its name and total, then its rows. Memoised, so loading earlier days or picking a row
 * only renders the days that changed, however long the list gets.
 */
const DayGroup = memo(function DayGroup({
  day,
  today,
  people,
  wide,
  picked,
  onPick,
}: {
  day: { date: PlainDate; rows: ActivityRow[] };
  today: PlainDate;
  people: People;
  wide: boolean;
  /** The picked row's id, when it's on this day. */
  picked: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <section className={styles.day} aria-labelledby={`day-${day.date}`}>
      <div className={styles.dayHead}>
        <h3 id={`day-${day.date}`} className={styles.dayName}>
          {dayLabel(day.date, today)}
        </h3>
        <span className="muted tnum">{dayTotal(day.rows)}</span>
      </div>
      <ul className={styles.rows}>
        {day.rows.map((row) => (
          <li key={row.id}>
            <Row
              row={row}
              people={people}
              wide={wide}
              picked={row.id === picked}
              onPick={() => onPick(row.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
});

/** One row: a phone row of two lines, or a desktop table row, from the same markup. */
function Row({
  row,
  people,
  wide,
  picked,
  onPick,
}: {
  row: ActivityRow;
  people: People;
  /** On desktop a row picks; on a phone it opens the sheet. */
  wide: boolean;
  picked: boolean;
  onPick: () => void;
}) {
  const whose = whoseLook(row.whose, people);
  const dot = (
    <span
      className={styles.dot}
      style={{ background: colourVar(categoryColour(row.parts[0]?.category ?? row.category)) }}
      aria-hidden="true"
    />
  );
  const category = categoryLabel(row);
  return (
    <button
      type="button"
      className={cx(styles.row, row.pending && styles.pending, picked && styles.picked)}
      aria-label={rowLabel(row, people)}
      aria-current={picked || undefined}
      aria-haspopup={wide ? undefined : "dialog"}
      onClick={onPick}
    >
      <Tile icon={rowIcon(row)} size="sm" className={styles.tile} />
      <span className={styles.what}>
        <span className={styles.deskDot}>{dot}</span>
        <span className={styles.name}>{row.shop}</span>
        <span className={styles.rowTags}>
          {row.pending && <Tag>Pending</Tag>}
          {row.notCounted && <Tag>Not counted</Tag>}
          {row.parts.length > 0 && <Tag icon="split">Split</Tag>}
          {row.tags.slice(0, 1).map((tag) => (
            <Tag key={tag.id}>{tag.name}</Tag>
          ))}
        </span>
      </span>
      <span className={styles.meta}>
        {dot}
        <span className={styles.clip}>
          {category} · {row.account.name}
        </span>
      </span>
      <span className={cx(styles.cell, styles.cat, !row.category && styles.quiet)}>{category}</span>
      <span className={cx(styles.cell, styles.acct)}>{row.account.name}</span>
      <span className={styles.who}>
        <Avatar size="sm" owner={whose.owner} initials={whose.initials} label={whose.label} />
      </span>
      <span className={cx("amt", styles.amount, (row.pending || row.notCounted) && styles.quiet)}>
        {rowAmount(row)}
      </span>
    </button>
  );
}

function NoMatch({
  show,
  search,
  find,
  clearFilters,
}: {
  show: Show;
  search: string;
  find: Find;
  clearFilters: string | null;
}) {
  if (clearFilters)
    return (
      <div className={styles.none}>
        <Tile icon="search" size="sm" />
        <p className={styles.noneTitle}>No transactions match these filters</p>
        <ButtonLink href={clearFilters} replace scroll={false}>
          Clear filters
        </ButtonLink>
      </div>
    );
  if (search)
    return (
      <div className={styles.none}>
        <Tile icon="search" size="sm" />
        <p className={styles.noneTitle}>No transactions match &ldquo;{search}&rdquo;</p>
        <ButtonLink href={activityHref(show, "", find)} replace scroll={false}>
          Clear search
        </ButtonLink>
      </div>
    );
  if (show === "check")
    return (
      <div className={styles.none}>
        <Tile icon="check" size="sm" tone="good" />
        <p className={styles.noneTitle}>Nothing to check</p>
        <p className="small muted">Every transaction has a category.</p>
      </div>
    );
  return (
    <div className={styles.none}>
      <Tile icon="list" size="sm" />
      <p className={styles.noneTitle}>No transactions here yet</p>
    </div>
  );
}
