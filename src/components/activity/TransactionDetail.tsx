import { colourVar, cx, Icon, Tag, Tile, Well, type IconName } from "@/components/ui";
import type { ActivityRow } from "@/lib/access";
import { formatShortDate } from "@/lib/money";
import { categoryColour } from "@/lib/sorting/colour";
import styles from "./Activity.module.css";
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
 * One transaction: what it was, whose and where from. The transaction sheet on a phone and the
 * panel beside the list on desktop. Categorising, splits, tags and notes come in later tickets.
 */
export function TransactionDetail({ row, people }: { row: ActivityRow; people: People }) {
  const whose = whoseLook(row.whose, people);
  const about = aboutRow(row);
  const colour = colourVar(categoryColour(row.category));
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

      <dl className={styles.facts}>
        <div>
          <dt>Category</dt>
          <dd>
            <span className={styles.dot} style={{ background: colour }} />
            {row.category?.name ?? "No category yet"}
          </dd>
        </div>
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
