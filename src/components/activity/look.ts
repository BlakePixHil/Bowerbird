import { ICONS, type IconName, type Owner } from "@/components/ui";
import type { ActivityRow, Whose } from "@/lib/access";
import { addDays, formatMoney, formatShortDate, parts, spentBy, type PlainDate } from "@/lib/money";

/** The people a row's avatar can stand for. */
export type People = {
  me: { name: string; initials: string };
  /** The household's other member, once project 07 invites one. */
  partner: { name: string; initials: string } | null;
};

/** The avatar for whose account a row came from: your blue ring, the partner's pink or shared amber. */
export function whoseLook(
  whose: Whose,
  people: People,
): { owner: Owner; initials: string; label: string } {
  if (whose === "shared") return { owner: "shared", initials: "S", label: "Shared" };
  if (whose === "partner") {
    const partner = people.partner ?? { name: "Partner", initials: "P" };
    return { owner: "partner", initials: partner.initials, label: partner.name };
  }
  return { owner: "you", initials: people.me.initials, label: people.me.name };
}

const isIcon = (name: string | null | undefined): name is IconName =>
  !!name && Object.hasOwn(ICONS, name);

/** The icon in a row's tile: the category's own, or one for its kind. */
export function rowIcon(row: Pick<ActivityRow, "category" | "notCounted" | "parts">): IconName {
  if (row.parts.length > 0) return "split";
  if (isIcon(row.category?.icon)) return row.category.icon;
  if (row.notCounted) return "transfer";
  if (row.category?.kind === "income") return "income";
  return row.category ? "tag" : "help";
}

/** A row's category in words: its parts' for a split row ("Groceries, Shopping"). */
export function categoryLabel(row: Pick<ActivityRow, "category" | "parts">): string {
  if (row.parts.length > 0) return row.parts.map((part) => part.category.name).join(", ");
  return row.category?.name ?? "No category";
}

/** "Groceries $40 · Shopping $24", for the split row on the transaction sheet. */
export function partsLine(row: Pick<ActivityRow, "parts">): string {
  return row.parts
    .map(
      (part) =>
        `${part.category.name} ${formatMoney(Math.abs(part.cents), { decimals: "auto", sign: "never" })}`,
    )
    .join(" · ");
}

/** "Today, Sat 10 Oct", "Yesterday, Fri 9 Oct", "Thu 8 Oct", and the year when it isn't this one. */
export function dayLabel(date: PlainDate, today: PlainDate): string {
  const year = parts(date).year !== parts(today).year;
  const day = formatShortDate(date, { year });
  if (date === today) return `Today, ${day}`;
  if (date === addDays(today, -1)) return `Yesterday, ${day}`;
  return day;
}

/** "$112.40 spent" under a day, or "Nothing spent". */
export function dayTotal(rows: readonly Pick<ActivityRow, "amountCents" | "notCounted">[]): string {
  const spent = rows.reduce((sum, row) => sum + spentBy(row), 0);
  return spent > 0 ? `${formatMoney(spent)} spent` : "Nothing spent";
}

/** −$86.20 for money out, +$3,260.00 for money in. */
export const rowAmount = (row: Pick<ActivityRow, "amountCents">) =>
  formatMoney(row.amountCents, { sign: "always" });

/** The words a screen reader hears for a row, which also name it as a button. */
export function rowLabel(row: ActivityRow, people: People): string {
  return [
    row.shop,
    rowAmount(row),
    categoryLabel(row),
    row.account.name,
    whoseLook(row.whose, people).label,
    row.pending && "Pending",
    row.notCounted && "Not counted",
    row.parts.length > 0 && "Split",
    ...row.tags.map((tag) => tag.name),
  ]
    .filter(Boolean)
    .join(", ");
}

/** Rows in order, grouped by day. Pages end on whole days, so a day is never split. */
export function byDay<T extends { date: PlainDate }>(
  rows: readonly T[],
): { date: PlainDate; rows: T[] }[] {
  const days: { date: PlainDate; rows: T[] }[] = [];
  for (const row of rows) {
    const last = days.at(-1);
    if (last?.date === row.date) last.rows.push(row);
    else days.push({ date: row.date, rows: [row] });
  }
  return days;
}
