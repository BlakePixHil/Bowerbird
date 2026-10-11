"use client";

import { useId, type DragEvent, type ReactNode } from "react";
import { Key } from "@/components/charts/shared";
import {
  Button,
  Card,
  Checkbox,
  colourVar,
  cx,
  Icon,
  Pill,
  SelectField,
  TextField,
  Tile,
  Well,
  type IconName,
} from "@/components/ui";
import { APP_NAME } from "@/config/app";
import { COLUMN_ROLES, type ColumnRole } from "@/lib/banks/files";
import {
  ACCOUNT_NAME_MAX,
  FILE_ACCOUNT_KINDS,
  type FileAccountKind,
  type ImportCheck,
  type ImportDone,
  type PreviewRow,
  type SortGroup,
} from "@/lib/banks/imports/shapes";
import { formatMoney, formatShortDate } from "@/lib/money";
import { categoryColour } from "@/lib/sorting/colour";
import styles from "./Import.module.css";
import {
  categoryIcon,
  columnName,
  count,
  dateRange,
  fileSize,
  FORMAT_LABEL,
  KIND_LABEL,
  number,
  ROLE_LABEL,
  shortRange,
  shownSample,
  understood,
} from "./labels";

/** An account the file can go into, ready to show. */
export type AccountChoice = {
  id: string;
  name: string;
  /** "Yours · Westpac" */
  meta: string;
  icon: IconName;
};

/** The new account's details as the person types them. */
export type Draft = { name: string; bank: string; kind: FileAccountKind; joint: boolean };

export const NEW = "new";

const shortDate = (date: string) => formatShortDate(date);
const lookClass = (look: "phone" | "desktop") =>
  look === "phone" ? styles.onPhone : styles.onDesktop;
const signed = (cents: number) => formatMoney(cents, { sign: "always" });

/** The three steps on a phone. Steps before `at` are done; `at` is the one on screen. */
export function Steps({ at }: { at: 2 | 3 }) {
  const steps = ["Account", "File", "Check"];
  return (
    <ol className={cx(styles.steps, at === 3 && styles.allDone)} aria-label="Steps">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < at ? "done" : n === at ? "now" : "next";
        return (
          <li
            key={label}
            className={cx(styles.step, styles[state])}
            aria-current={state === "now" ? "step" : undefined}
          >
            <span className={styles.stepDot} aria-hidden="true">
              {state === "done" ? <Icon name="check" size="sm" /> : n}
            </span>
            <span>
              {label}
              {state === "done" && <span className="sr-only">, done</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A section title with a note on the right, such as "1. Which account is it from?". */
export function SectionHead({ id, title, note }: { id?: string; title: string; note?: ReactNode }) {
  return (
    <div className={styles.sectionHead}>
      <h2 className="h2" id={id}>
        {title}
      </h2>
      {note && <span className="muted small">{note}</span>}
    </div>
  );
}

/** The numbered title of each desktop card. */
export function CardHead({ n, title, note }: { n: number; title: string; note?: ReactNode }) {
  return (
    <div className={styles.cardHead}>
      <span className={styles.number} aria-hidden="true">
        {n}
      </span>
      <h2 className="h2 grow">{title}</h2>
      {note && <span className="muted small">{note}</span>}
    </div>
  );
}

/** Pick one of the accounts, or a new one that only gets files. Real radio buttons underneath. */
export function AccountPicker({
  accounts,
  value,
  onChange,
  draft,
  onDraft,
  labelledBy,
  look,
}: {
  accounts: readonly AccountChoice[];
  value: string;
  onChange: (id: string) => void;
  draft: Draft;
  onDraft: (draft: Draft) => void;
  labelledBy: string;
  look: "phone" | "desktop";
}) {
  const name = useId();
  const choices: AccountChoice[] = [
    ...accounts,
    {
      id: NEW,
      name: "A new account",
      meta: "For an account you only import files for",
      icon: "plus",
    },
  ];
  return (
    <div className={cx(styles.picker, lookClass(look))}>
      <div role="radiogroup" aria-labelledby={labelledBy} className={styles.choices}>
        {choices.map((account) => (
          <label key={account.id} className={styles.choice}>
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={account.id}
              checked={value === account.id}
              onChange={() => onChange(account.id)}
            />
            {look === "desktop" && <span className={styles.radio} aria-hidden="true" />}
            <Tile icon={account.icon} size="sm" />
            <span className="grow">
              <span className={cx("ellipsis", styles.choiceName)}>{account.name}</span>
              <span className={cx("muted small", styles.block)}>{account.meta}</span>
            </span>
            {look === "phone" && <span className={styles.radio} aria-hidden="true" />}
          </label>
        ))}
      </div>
      {value === NEW && <NewAccountFields draft={draft} onDraft={onDraft} />}
    </div>
  );
}

function NewAccountFields({ draft, onDraft }: { draft: Draft; onDraft: (draft: Draft) => void }) {
  return (
    <fieldset className={styles.newAccount}>
      <legend className="sr-only">The new account</legend>
      <TextField
        label="Account name"
        value={draft.name}
        maxLength={ACCOUNT_NAME_MAX}
        placeholder="Everyday"
        autoComplete="off"
        onChange={(event) => onDraft({ ...draft, name: event.target.value })}
      />
      <TextField
        label="Bank"
        value={draft.bank}
        maxLength={ACCOUNT_NAME_MAX}
        placeholder="Your bank's name"
        autoComplete="off"
        hint="Optional. It helps spot a file from the wrong bank."
        onChange={(event) => onDraft({ ...draft, bank: event.target.value })}
      />
      <SelectField
        label="Kind of account"
        value={draft.kind}
        options={FILE_ACCOUNT_KINDS.map((kind) => ({ value: kind, label: KIND_LABEL[kind] }))}
        onChange={(event) => onDraft({ ...draft, kind: event.target.value as FileAccountKind })}
      />
      <Checkbox
        checked={draft.joint}
        onChange={(event) => onDraft({ ...draft, joint: event.target.checked })}
      >
        It&apos;s a joint account. Joint accounts start shared with your household.
      </Checkbox>
    </fieldset>
  );
}

/** Where a file goes before one is chosen. On desktop it also takes a dropped file. */
export function DropZone({
  look,
  hint,
  onChoose,
  onDrop,
}: {
  look: "phone" | "desktop";
  hint: string;
  onChoose: () => void;
  onDrop: (file: File) => void;
}) {
  const icon = (
    <span className={styles.dropIcon} aria-hidden="true">
      <Icon name="upload" size="lg" />
    </span>
  );
  if (look === "phone") {
    return (
      <button type="button" className={cx(styles.drop, styles.dropPhone)} onClick={onChoose}>
        {icon}
        <span className={styles.dropTitle}>Choose a file</span>
        <span className="muted small">{hint}</span>
      </button>
    );
  }
  return (
    <div className={cx(styles.drop, styles.dropDesktop)} {...dropTarget(onDrop)}>
      {icon}
      <span className={styles.dropTitle}>Drop the file here</span>
      <span className="muted small">{hint}</span>
      <Button onClick={onChoose} className={styles.dropButton}>
        Choose a file
      </Button>
    </div>
  );
}

/** An area that takes a file dragged onto it, such as the chosen file to replace it. */
export function DropArea({
  onDrop,
  className,
  children,
}: {
  onDrop: (file: File) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className} {...dropTarget(onDrop)}>
      {children}
    </div>
  );
}

/** Takes a file dragged onto an element. */
function dropTarget(onDrop: (file: File) => void) {
  return {
    onDragOver: (event: DragEvent) => {
      if (event.dataTransfer.types.includes("Files")) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    },
    onDrop: (event: DragEvent) => {
      const file = event.dataTransfer.files[0];
      if (!file) return;
      event.preventDefault();
      onDrop(file);
    },
  };
}

export type FileState =
  { kind: "reading" } | { kind: "ok"; check: ImportCheck } | { kind: "problem"; error: string };

/** The chosen file: its name, size and type, and whether it reads fine. */
export function FileCard({
  name,
  size,
  how,
  state,
  accountName,
  onRemove,
  imported = false,
  look,
}: {
  name: string;
  size: number;
  how: "chosen" | "dropped";
  state: FileState;
  accountName: string;
  onRemove?: () => void;
  imported?: boolean;
  look: "phone" | "desktop";
}) {
  const format = state.kind === "ok" ? FORMAT_LABEL[state.check.file.format] : null;
  const when = imported ? "imported just now" : `${how} just now`;
  const meta = [fileSize(size), format, when].filter(Boolean).join(" · ");
  return (
    <div className={cx(styles.fileCard, lookClass(look), imported && styles.fileDone)}>
      <div className={styles.fileTop}>
        <span className={styles.fileIcon} aria-hidden="true">
          <Icon name="file" />
        </span>
        <div className="grow">
          <div className={cx("ellipsis", styles.fileName)}>{name}</div>
          <div className="muted small">{meta}</div>
        </div>
        {imported ? (
          <Pill tone="good">Imported</Pill>
        ) : (
          onRemove && (
            <button
              type="button"
              className={styles.remove}
              aria-label={`Remove ${name}`}
              title={`Remove ${name}`}
              onClick={onRemove}
            >
              <Icon name="close" size={look === "phone" ? "md" : "sm"} />
            </button>
          )
        )}
      </div>
      <FileStatus state={state} accountName={accountName} imported={imported} />
    </div>
  );
}

function FileStatus({
  state,
  accountName,
  imported,
}: {
  state: FileState;
  accountName: string;
  imported: boolean;
}) {
  if (state.kind === "reading") {
    return (
      <p role="status" className={cx("small muted", styles.status)}>
        <Icon name="refresh" size="sm" className={styles.spin} />
        Reading the file…
      </p>
    );
  }
  if (state.kind === "problem") {
    return (
      <p role="alert" className={cx("small", styles.status, styles.problem)}>
        <Icon name="alert" size="sm" />
        {state.error}
      </p>
    );
  }
  const { check } = state;
  return (
    <>
      {check.mismatch ? (
        <p role="status" className={cx("small", styles.mismatch)}>
          <Icon name="alert" size="sm" />
          <span>
            <strong>This file looks like it&apos;s from a different bank.</strong>{" "}
            <span className="sub">
              You picked {accountName || "a new account"}. Check it came from there.
            </span>
          </span>
        </p>
      ) : (
        <p role="status" className={cx("small", styles.status, styles.good)}>
          <Icon name="check" size="sm" />
          {imported
            ? `Read fine, ${count(check.rows, "row")}`
            : check.problem
              ? "Opens fine. Check the columns before importing."
              : `Reads fine, ${count(check.rows, "row")} ready to check`}
        </p>
      )}
    </>
  );
}

const HELP: { icon: IconName; title: string; detail: string; steps: string[] }[] = [
  {
    icon: "monitor",
    title: "From your bank’s website",
    detail: "Look for Export or Download",
    steps: [
      "Sign in to your bank’s website on a computer.",
      "Open the account and look for Export or Download transactions.",
      "Pick the dates you need, choose CSV, OFX or QIF, and save the file.",
    ],
  },
  {
    icon: "file",
    title: "Which file type?",
    detail: "OFX or QIF if offered, otherwise CSV",
    steps: [
      "OFX and QIF are standard formats, so they read cleanly.",
      "A CSV works too. You check the columns before anything is saved.",
      "Rows already here are skipped, so overlapping dates are fine.",
    ],
  },
];

/** "Where do I get the file?" Two questions that open in place. */
export function FileHelp({ firstOpen }: { firstOpen: boolean }) {
  return (
    <div className={styles.help}>
      {HELP.map((item, i) => (
        <details key={item.title} className={styles.helpItem} open={firstOpen && i === 0}>
          <summary className={styles.helpSummary}>
            <Tile icon={item.icon} size="sm" />
            <span className="grow">
              <span className={styles.block}>{item.title}</span>
              <span className="muted small">{item.detail}</span>
            </span>
            <Icon name="chevron-down" size="sm" className={styles.chevron} />
          </summary>
          <ol className={styles.helpSteps}>
            {item.steps.map((step, j) => (
              <li key={step} className="small sub">
                <span className="mono">{j + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </details>
      ))}
    </div>
  );
}

export function ReadOnlyNote() {
  return (
    <p className={cx("small", styles.note)}>
      <Icon name="shield-plain" size="sm" />
      <span className="muted">
        {APP_NAME} only reads the file. It never moves money and never asks for your bank password.
      </span>
    </p>
  );
}

/** The roles in use: the person's choice, or what the file was read as. */
export const rolesOf = (check: ImportCheck, chosen: readonly ColumnRole[] | null) =>
  chosen ?? check.columns.map((column) => column.role);

/** One column's "read as" choice. */
export function RoleSelect({
  label,
  value,
  onChange,
  look,
}: {
  label: string;
  value: ColumnRole;
  onChange: (role: ColumnRole) => void;
  look: "phone" | "desktop";
}) {
  return (
    <span className={cx(styles.roleSelect, lookClass(look), value === "ignore" && styles.unused)}>
      {look === "phone" && value !== "ignore" && (
        <Icon name="check" size="sm" className={styles.roleCheck} />
      )}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as ColumnRole)}
      >
        {COLUMN_ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size="sm" className={styles.roleChevron} />
    </span>
  );
}

/** "Columns we understood": a chip for each thing the file was read as. */
export function ColumnChips({ check, small = false }: { check: ImportCheck; small?: boolean }) {
  const labels = understood(check.columns);
  return (
    <ul className={cx(styles.chips, small && styles.chipsSmall)}>
      {labels.map((label) => (
        <li key={label} className={styles.chip}>
          <Icon name="check" size="sm" />
          {label}
        </li>
      ))}
    </ul>
  );
}

/** Why the columns need a look: a guess, or something missing. */
export function ColumnNote({ check }: { check: ImportCheck }) {
  if (check.problem) {
    return (
      <p role="alert" className={cx("small", styles.status, styles.problem)}>
        <Icon name="alert" size="sm" />
        {check.problem}
      </p>
    );
  }
  if (!check.needsCheck) return null;
  return (
    <p className={cx("small", styles.status, styles.warnInk)}>
      <Icon name="info" size="sm" />
      We guessed these from the file. Check they&apos;re right before importing.
    </p>
  );
}

/** Notes such as rows that couldn't be read. */
export function Warnings({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className={styles.warnings}>
      {warnings.map((warning) => (
        <li key={warning} className={cx("small", styles.mismatch)}>
          <Icon name="alert" size="sm" />
          <span className="sub">{warning}</span>
        </li>
      ))}
    </ul>
  );
}

/** The small round key for a row's category: its colour, an outline when it's left to check. */
export function CategoryDot({ row }: { row: Pick<PreviewRow, "category" | "status"> }) {
  if (row.status === "transfer" || row.category) {
    const colour = row.category ? categoryColour(row.category) : "c-other";
    return (
      <span className={styles.dot} style={{ background: colourVar(colour) }} aria-hidden="true" />
    );
  }
  return <span className={cx(styles.dot, styles.dotCheck)} aria-hidden="true" />;
}

export function categoryLabel(row: Pick<PreviewRow, "category" | "status">) {
  if (row.status === "transfer") return "Transfer, not counted";
  return row.category?.name ?? "To check";
}

/** A card of rows from the file, as on "Check before importing". */
export function RowCard({ rows, here = false }: { rows: readonly PreviewRow[]; here?: boolean }) {
  return (
    <ul className={cx(styles.rowCard, here && styles.hereRows)}>
      {rows.map((row, i) => (
        <li key={`${row.date}-${i}`} className={styles.fileRow}>
          <Tile icon={categoryIcon(row.category, row.status === "transfer")} size="sm" />
          <div className={styles.fileRowText}>
            <div className={styles.fileRowTop}>
              <span className={cx("ellipsis", styles.rowName)}>{row.name ?? row.description}</span>
              <span className={cx("amt", row.status === "transfer" && "muted")}>
                {signed(row.amountCents)}
              </span>
            </div>
            {row.name && <div className={cx("mono ellipsis", styles.raw)}>{row.description}</div>}
            {here ? (
              <div className={styles.rowMeta}>
                <Pill tone="quiet" icon="check-double">
                  Already here
                </Pill>
                <span className="muted small">{shortDate(row.date)}</span>
              </div>
            ) : (
              <div className={cx("small", styles.rowMeta)}>
                <CategoryDot row={row} />
                <span className="sub">{categoryLabel(row)}</span>
                <span className="muted">· {shortDate(row.date)}</span>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The bar of new rows against rows already here. */
export function NewHereBar({ check, height }: { check: ImportCheck; height?: number }) {
  return (
    <div
      role="img"
      aria-label={`${count(check.fresh, "new row")} and ${number(check.here)} already here`}
      className={styles.stack}
      style={height ? { height } : undefined}
    >
      {check.fresh > 0 && (
        <span style={{ flexGrow: check.fresh, background: colourVar("accent") }} />
      )}
      {check.here > 0 && <span style={{ flexGrow: check.here, background: colourVar("ghost") }} />}
    </div>
  );
}

/** "Check before importing" on a phone: the file, its rows, and what happens to them. */
export function SummaryCard({ check, sizeLabel }: { check: ImportCheck; sizeLabel: string }) {
  const range = dateRange(check.from, check.to);
  return (
    <Card as="section" className={styles.summary} aria-label="What is in the file">
      <div className={styles.fileTop}>
        <span className={styles.fileIcon} aria-hidden="true">
          <Icon name="file" />
        </span>
        <div className="grow">
          <div className={cx("ellipsis", styles.fileName)}>{check.file.name}</div>
          <div className="muted small">
            Into {check.accountName || "a new account"} · {sizeLabel}
          </div>
        </div>
      </div>
      <div className={styles.bigCount}>
        <span className="big tnum">{number(check.rows)}</span>
        <span className="sub">{check.rows === 1 ? "row" : "rows"}</span>
      </div>
      {range && <div className="muted small">{range}</div>}
      <NewHereBar check={check} />
      <ul className={styles.summaryRows}>
        <li>
          <Key colour="accent" kind="square" />
          <span className="grow">New, will be imported</span>
          <span className="amt">{number(check.fresh)}</span>
        </li>
        <li>
          <Key colour="ghost" kind="square" />
          <span className="grow">
            <span className={styles.block}>Already here, skipped</span>
            <span className="muted small">
              Same date, amount and description as a row already in the app
            </span>
          </span>
          <span className="amt">{number(check.here)}</span>
        </li>
        <li>
          <Icon name="transfer" size="sm" className={styles.rowIcon} />
          <span className="grow">
            <span className={styles.block}>Transfers between your own accounts</span>
            <span className="muted small">Part of the new rows, but not counted in spending.</span>
          </span>
          <span className="amt">{number(check.transfers)}</span>
        </li>
      </ul>
    </Card>
  );
}

/** The four numbers at the top of the desktop check. */
export function Kpis({ check, done }: { check: ImportCheck; done: ImportDone | null }) {
  const range = shortRange(check.from, check.to);
  const items: {
    label: string;
    value: number;
    sub: string;
    key?: "accent" | "ghost";
    icon?: IconName;
  }[] = [
    { label: "Rows in the file", value: check.rows, sub: range ?? "No rows", icon: "rows" },
    done
      ? {
          label: "Imported",
          value: done.imported,
          sub: `Now in ${done.accountName}`,
          key: "accent",
        }
      : { label: "New", value: check.fresh, sub: "Will be imported", key: "accent" },
    {
      label: "Already here",
      value: done ? done.skipped : check.here,
      sub: "Skipped",
      key: "ghost",
    },
    {
      label: "Transfers",
      value: done ? done.transfers : check.transfers,
      sub: "Between your own accounts, not counted",
      icon: "transfer",
    },
  ];
  return (
    <ul className={styles.kpis}>
      {items.map((item) => (
        <li key={item.label} className={styles.kpi}>
          <span className={cx("small sub", styles.kpiLabel)}>
            {item.key && <Key colour={item.key} kind="square" />}
            {item.icon && <Icon name={item.icon} size="sm" className={styles.kpiIcon} />}
            {item.label}
          </span>
          <span className="mid tnum">{number(item.value)}</span>
          <span className="tiny muted">{item.sub}</span>
        </li>
      ))}
    </ul>
  );
}

const groupLabel = (group: SortGroup) =>
  group.kind === "category"
    ? group.category.name
    : group.kind === "rest"
      ? "Everything else"
      : "To check";

/** How the new rows will be sorted: one bar, split by the category each row gets. */
export function SortBar({ sorts, done }: { sorts: readonly SortGroup[]; done: boolean }) {
  const total = sorts.reduce((sum, group) => sum + group.rows, 0);
  if (total === 0) return null;
  const words = sorts.map((group) => `${groupLabel(group)} ${group.rows}`).join(", ");
  const title = done
    ? `How the ${number(total)} were sorted`
    : `How the ${number(total)} new ${total === 1 ? "row" : "rows"} will be sorted`;
  return (
    <div className={styles.divided}>
      <div className={styles.splitHead}>
        <span className="small sub">{title}</span>
        <span className="tiny muted">Rows, by the category each one gets</span>
      </div>
      <div role="img" aria-label={`${title}: ${words}`} className={cx(styles.stack, styles.thin)}>
        {sorts.map((group) => (
          <span
            key={groupLabel(group)}
            className={group.kind === "check" ? styles.checkPart : undefined}
            style={{
              flexGrow: group.rows,
              background:
                group.kind === "category"
                  ? colourVar(categoryColour(group.category))
                  : group.kind === "rest"
                    ? colourVar("c-other")
                    : undefined,
            }}
          />
        ))}
      </div>
      <ul className={styles.legend}>
        {sorts.map((group) => (
          <li key={groupLabel(group)}>
            <span
              className={cx(styles.key, group.kind === "check" && styles.dotCheck)}
              style={{
                background:
                  group.kind === "category"
                    ? colourVar(categoryColour(group.category))
                    : group.kind === "rest"
                      ? colourVar("c-other")
                      : undefined,
              }}
              aria-hidden="true"
            />
            {groupLabel(group)} <span className={styles.legendValue}>{number(group.rows)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The columns as a table, each with its "read as" choice, for the desktop check. */
export function ColumnTable({
  check,
  roles,
  onRole,
}: {
  check: ImportCheck;
  roles: readonly ColumnRole[];
  onRole: (index: number, role: ColumnRole) => void;
}) {
  return (
    <Well className={styles.columnTable}>
      <table>
        <caption className="sr-only">Columns in {check.file.name}</caption>
        <thead>
          <tr>
            <th scope="col">In the file</th>
            <th scope="col">First value</th>
            <th scope="col">Read as</th>
          </tr>
        </thead>
        <tbody>
          {check.columns.map((column, i) => {
            const name = columnName(column, i);
            return (
              <tr key={i}>
                <td className="mono">{name}</td>
                <td className={cx("mono", styles.sample)}>{shownSample(column.sample)}</td>
                <td>
                  <RoleSelect
                    look="desktop"
                    label={`Column ${name}, read as`}
                    value={roles[i] ?? "ignore"}
                    onChange={(role) => onRole(i, role)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Well>
  );
}

const STATUS: Record<
  PreviewRow["status"],
  { before: [string, "quiet" | "accent", IconName]; after: [string, "quiet" | "good", IconName] }
> = {
  here: {
    before: ["Already here", "quiet", "check-double"],
    after: ["Skipped", "quiet", "check-double"],
  },
  new: { before: ["New", "accent", "plus"], after: ["Imported", "good", "check"] },
  transfer: {
    before: ["Transfer, not counted", "quiet", "transfer"],
    after: ["Imported, not counted", "quiet", "transfer"],
  },
};

/** The first rows of the file on desktop, each with its category and what happens to it. */
export function PreviewTable({
  check,
  done,
  accountName,
}: {
  check: ImportCheck;
  done: boolean;
  accountName: string;
}) {
  return (
    <Card as="section" className={styles.previewCard} aria-labelledby="preview-title">
      <div className={styles.previewHead}>
        <h2 className="h2" id="preview-title">
          {done ? "What came in" : "Preview"}
        </h2>
        <span className="muted small tnum">
          {check.preview.length < check.rows
            ? `First ${check.preview.length} of ${count(check.rows, "row")}`
            : count(check.rows, "row")}
        </span>
      </div>
      <div className={styles.scrollX}>
        <table className={styles.previewTable}>
          <caption className="sr-only">
            {done ? "What came in" : "Preview"}: the first rows of {check.file.name}
          </caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Shop name and bank text</th>
              <th scope="col">Category</th>
              <th scope="col">Account</th>
              <th scope="col" className={styles.num}>
                Amount
              </th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {check.preview.map((row, i) => {
              const [label, tone, icon] = done
                ? STATUS[row.status].after
                : STATUS[row.status].before;
              return (
                <tr
                  key={`${row.date}-${i}`}
                  className={row.status === "here" ? styles.hereRow : undefined}
                >
                  <td className="small sub tnum">{shortDate(row.date)}</td>
                  <td>
                    <span className={cx("ellipsis", styles.rowName, styles.block)}>
                      {row.name ?? row.description}
                    </span>
                    {row.name && (
                      <span className={cx("mono ellipsis", styles.raw, styles.block)}>
                        {row.description}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={cx("small", styles.categoryCell)}>
                      <CategoryDot row={row} />
                      <span className="ellipsis sub">
                        {row.status === "here" ? "Unchanged" : categoryLabel(row)}
                      </span>
                    </span>
                  </td>
                  <td className="small sub ellipsis">{accountName || "New account"}</td>
                  <td className={cx("amt", styles.num, row.status === "transfer" && "muted")}>
                    {signed(row.amountCents)}
                  </td>
                  <td>
                    <Pill tone={tone} icon={icon}>
                      {label}
                    </Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={cx("small muted", styles.previewFoot)}>
        Transfers between your own accounts are matched (the same amount out and in within 3 days)
        and are not counted in spending. You can change any category later.
      </p>
    </Card>
  );
}

/** "What happened": the rows of the done screen on a phone. */
export function DoneRows({ done }: { done: ImportDone }) {
  const rows: {
    label: string;
    sub: string;
    value: number;
    icon: IconName;
    tone: "toneGood" | "toneWarn" | "toneQuiet";
    key?: "accent" | "warn";
  }[] = [
    {
      label: "Sorted automatically",
      sub: "By your categories and rules",
      value: done.sorted,
      icon: "check",
      tone: "toneGood",
      key: "accent",
    },
    {
      label: "To check",
      sub: "We weren't sure about these",
      value: done.toCheck,
      icon: "help",
      tone: "toneWarn",
      key: "warn",
    },
    {
      label: "Transfers, not counted",
      sub: "Between your own accounts, not counted in spending",
      value: done.transfers,
      icon: "transfer",
      tone: "toneQuiet",
    },
    {
      label: "Already here, skipped",
      sub: "Same date, amount and description",
      value: done.skipped,
      icon: "check-double",
      tone: "toneQuiet",
    },
  ];
  return (
    <ul className={styles.doneRows}>
      {rows.map((row) => (
        <li key={row.label}>
          <span className={cx(styles.doneIcon, styles[row.tone])} aria-hidden="true">
            <Icon name={row.icon} size="sm" />
          </span>
          <span className="grow">
            <span className={styles.doneLabel}>
              {row.key && <Key colour={row.key} kind="square" />}
              {row.label}
            </span>
            <span className={cx("muted small", styles.block)}>{row.sub}</span>
          </span>
          <span className={cx("amt", styles.doneValue)}>{number(row.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Sorted against to check, after an import. */
export function SortedBar({ done, height }: { done: ImportDone; height?: number }) {
  if (done.imported === 0) return null;
  return (
    <div
      role="img"
      aria-label={`${number(done.sorted)} sorted automatically, ${number(done.toCheck)} to check`}
      className={styles.stack}
      style={height ? { height } : undefined}
    >
      {done.sorted > 0 && (
        <span style={{ flexGrow: done.sorted, background: colourVar("accent") }} />
      )}
      {done.toCheck > 0 && (
        <span style={{ flexGrow: done.toCheck, background: colourVar("warn") }} />
      )}
    </div>
  );
}

/** "202 transactions imported", or the plain truth when nothing was new. */
export function doneTitle(done: ImportDone) {
  return done.imported === 0
    ? "Nothing new to import"
    : `${count(done.imported, "transaction")} imported`;
}

export function doneLine(done: ImportDone) {
  const range = dateRange(done.from, done.to);
  const where = `From ${done.filename} into ${done.accountName}`;
  if (done.imported === 0) {
    return `Every row in ${done.filename} is already in ${done.accountName}, so nothing was counted twice.`;
  }
  return range ? `${where}, ${range}.` : `${where}.`;
}
