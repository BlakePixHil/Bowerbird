import { colourVar, cx, Icon, Tag, Tile, Well, type IconName } from "@/components/ui";
import type { ActivityRow, CategoryChoice } from "@/lib/access";
import { formatShortDate } from "@/lib/money";
import styles from "./Activity.module.css";
import { Categorise, type RowsChanged } from "./Categorise";
import { rowAmount, rowIcon, whoseLook, type People } from "./look";

/** Why a row counts the way it does, in a line under its tags. */
function aboutRow(row: ActivityRow): { icon: IconName; text: string } | null {
  if (row.pending)
    return { icon: "clock", text: "Pending. The amount can change until the bank settles it." };
  if (row.notCounted)
    return {
      icon: "transfer",
      text: "Moved between your own accounts, so it isn't counted as spending.",
    };
  if (!row.category)
    return { icon: "flag", text: "No category yet, so it's waiting to be checked." };
  if (row.amountCents > 0 && row.category.kind === "income")
    return { icon: "income", text: "Money in, so it isn't part of spending." };
  return null;
}

/**
 * One transaction: what it was, whose and where from, and its category to change. The transaction
 * sheet on a phone and the panel beside the list on desktop. Splits, tags and notes come later.
 */
export function TransactionDetail({
  row,
  people,
  categories,
  onChanged,
}: {
  row: ActivityRow;
  people: People;
  categories: readonly CategoryChoice[];
  onChanged: (change: RowsChanged) => void;
}) {
  const whose = whoseLook(row.whose, people);
  const about = aboutRow(row);
  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <Tile icon={rowIcon(row)} size="lg" />
        <div className={styles.detailWhat}>
          <div className={styles.detailName}>{row.shop}</div>
          {row.shop !== row.description && (
            <div className={cx("mono", styles.detailRaw)}>{row.description}</div>
          )}
        </div>
        <div className={styles.detailMoney}>
          <div className={cx("tnum", styles.detailAmount, row.pending && styles.quiet)}>
            {rowAmount(row)}
          </div>
          <div className="muted small">{formatShortDate(row.date)}</div>
        </div>
      </div>

      <div className={styles.detailTags}>
        <Tag>
          <span
            className={styles.dot}
            style={{ background: colourVar(ownerColour[whose.owner]) }}
          />
          {whose.label}
        </Tag>
        <Tag>{row.account.name}</Tag>
        {row.shop !== row.description && <Tag>Renamed from bank text</Tag>}
        {row.pending && <Tag>Pending</Tag>}
        {row.notCounted && <Tag>Not counted</Tag>}
        {row.split && <Tag icon="split">Split</Tag>}
        {row.tags.map((tag) => (
          <Tag key={tag} icon="tag">
            {tag}
          </Tag>
        ))}
      </div>

      {about && (
        <Well className={styles.about}>
          <Icon name={about.icon} size="sm" />
          <span className="small sub">{about.text}</span>
        </Well>
      )}
      {row.note && (
        <Well className={styles.about}>
          <Icon name="note" size="sm" />
          <span className="small sub">{row.note}</span>
        </Well>
      )}

      {categories.length > 0 && (
        <Categorise key={row.id} row={row} categories={categories} onChanged={onChanged} />
      )}

      <dl className={styles.facts}>
        <div>
          <dt>Account</dt>
          <dd>
            {row.account.name}
            {row.account.institution && <span className="muted"> · {row.account.institution}</span>}
          </dd>
        </div>
        <div>
          <dt>Whose</dt>
          <dd>{whose.label}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{formatShortDate(row.date, { year: true })}</dd>
        </div>
        <div>
          <dt>Came in by</dt>
          <dd>{row.source === "sync" ? "Live sync" : "A bank file"}</dd>
        </div>
      </dl>
    </div>
  );
}

const ownerColour = { you: "you", partner: "partner", shared: "shared" } as const;
