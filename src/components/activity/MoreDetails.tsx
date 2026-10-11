"use client";

import { useState, useTransition } from "react";
import { Button, Chip, cx, Icon, Pill, StackedBar, type IconName } from "@/components/ui";
import type { ActivityRow, TagRef } from "@/lib/access";
import { NOTE_MAX, TAG_NAME_MAX } from "@/lib/access/limits";
import { categoryColour } from "@/lib/sorting/colour";
import styles from "./Activity.module.css";
import { changeNote, changeTags } from "./actions";
import { partsLine } from "./look";

const failed = "Couldn't save that. Check your connection and try again.";

/** How many tags you've used show as quick picks. */
const OFFERED = 8;

type Open = "tags" | "note" | null;

/** One of the three rows under the category, from the "Categorise and make a rule" board. */
function DetailRow({
  icon,
  label,
  value,
  quiet,
  expanded,
  disabled,
  extra,
  onClick,
}: {
  icon: IconName;
  label: string;
  value: string;
  quiet: boolean;
  expanded?: boolean;
  disabled?: boolean;
  extra?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.moreRow}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
      <span className={styles.moreLabel}>{label}</span>
      {extra}
      <span className={cx("small", styles.moreValue, quiet && styles.quiet)}>{value}</span>
      <Icon
        name={expanded ? "chevron-up" : expanded === false ? "chevron-down" : "chevron-right"}
        size="sm"
      />
    </button>
  );
}

/** Why a row can't be split, or null when it can. */
function cantSplit(row: ActivityRow): string | null {
  if (row.notCounted) return "Not for transfers";
  if (row.pending) return "Once it settles";
  return null;
}

/**
 * Split, Tags and Note on the transaction sheet. Split opens the split editor in its place; tags
 * and the note open under their row and save as soon as they change.
 */
export function MoreDetails({
  row,
  tagChoices,
  onSplit,
  onChanged,
}: {
  row: ActivityRow;
  /** Tags the person has used, most used first. */
  tagChoices: readonly TagRef[];
  onSplit: () => void;
  onChanged: (row: ActivityRow) => void;
}) {
  const [open, setOpen] = useState<Open>(null);
  const toggle = (which: Exclude<Open, null>) => setOpen((now) => (now === which ? null : which));
  const why = cantSplit(row);
  const split = row.parts.length > 0;

  return (
    <div className={styles.more}>
      <DetailRow
        icon="split"
        label="Split across categories"
        value={why ?? (split ? partsLine(row) : "")}
        quiet={!split}
        disabled={why !== null}
        extra={
          split ? (
            <StackedBar
              label="Parts"
              className={styles.miniStack}
              height={4}
              parts={row.parts.map((part) => ({
                label: part.category.name,
                value: Math.abs(part.cents),
                colour: categoryColour(part.category),
              }))}
            />
          ) : undefined
        }
        onClick={onSplit}
      />
      <DetailRow
        icon="tag"
        label="Tags"
        value={row.tags.length > 0 ? row.tags.map((tag) => tag.name).join(", ") : "Add a tag"}
        quiet={row.tags.length === 0}
        expanded={open === "tags"}
        onClick={() => toggle("tags")}
      />
      {open === "tags" && (
        <TagsEditor
          row={row}
          choices={tagChoices}
          onSaved={(tags) => onChanged({ ...row, tags })}
        />
      )}
      <DetailRow
        icon="note"
        label="Note"
        value={row.note ? "Change" : "Add a note"}
        quiet
        expanded={open === "note"}
        onClick={() => toggle("note")}
      />
      {open === "note" && (
        <NoteEditor
          row={row}
          onSaved={(note) => {
            onChanged({ ...row, note });
            setOpen(null);
          }}
          onCancel={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** The row's tags, each with a way to take it off, then a field to add one and tags used before. */
function TagsEditor({
  row,
  choices,
  onSaved,
}: {
  row: ActivityRow;
  choices: readonly TagRef[];
  onSaved: (tags: TagRef[]) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const have = new Set(row.tags.map((tag) => tag.name.toLowerCase()));
  const words = text.trim().toLowerCase();
  const offered = choices
    .filter((tag) => !have.has(tag.name.toLowerCase()))
    .filter((tag) => !words || tag.name.toLowerCase().includes(words))
    .slice(0, OFFERED);

  function send(change: { add: string } | { remove: string }) {
    setError(null);
    start(async () => {
      const result = await changeTags({
        id: crypto.randomUUID(),
        transactionId: row.id,
        ...change,
      }).catch(() => null);
      if (!result?.ok) {
        setError(result?.error ?? failed);
        return;
      }
      if ("add" in change) setText("");
      onSaved(result.tags);
    });
  }

  return (
    <div className={styles.editor}>
      {row.tags.length > 0 && (
        <ul className={styles.tagList} aria-label="Tags on this transaction">
          {row.tags.map((tag) => (
            <li key={tag.id} className={styles.tagOn}>
              <Icon name="tag" size="sm" />
              <span>{tag.name}</span>
              <button
                type="button"
                className={styles.tagOff}
                aria-label={`Take off ${tag.name}`}
                disabled={busy}
                onClick={() => send({ remove: tag.id })}
              >
                <Icon name="close" size="sm" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className={styles.tagForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim() && !busy) send({ add: text });
        }}
      >
        <label className={styles.input}>
          <Icon name="tag" size="sm" />
          <input
            type="text"
            value={text}
            maxLength={TAG_NAME_MAX}
            placeholder="New tag, like a trip or an event"
            aria-label="Add a tag"
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <Button type="submit" disabled={!text.trim() || busy}>
          Add
        </Button>
      </form>
      {offered.length > 0 && (
        <div className={styles.tagChoices} role="group" aria-label="Tags you've used">
          {offered.map((tag) => (
            <Chip key={tag.id} icon="tag" disabled={busy} onClick={() => send({ add: tag.name })}>
              {tag.name}
            </Chip>
          ))}
        </div>
      )}
      {error && (
        <Pill tone="crit" className={styles.saidPill}>
          <span role="alert">{error}</span>
        </Pill>
      )}
    </div>
  );
}

/** A short note on the transaction, saved with Save note. */
function NoteEditor({
  row,
  onSaved,
  onCancel,
}: {
  row: ActivityRow;
  onSaved: (note: string | null) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(row.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function save(note: string) {
    setError(null);
    start(async () => {
      const result = await changeNote({
        id: crypto.randomUUID(),
        transactionId: row.id,
        note,
      }).catch(() => null);
      if (!result?.ok) {
        setError(result?.error ?? failed);
        return;
      }
      onSaved(result.note);
    });
  }

  return (
    <form
      className={styles.editor}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) save(text);
      }}
    >
      <textarea
        className={styles.noteInput}
        rows={3}
        value={text}
        maxLength={NOTE_MAX}
        placeholder="Who it was for, or what it was about"
        aria-label="Note"
        onChange={(event) => setText(event.target.value)}
      />
      <div className={styles.noteFoot}>
        <span className="tiny muted tnum">
          {text.length}/{NOTE_MAX}
        </span>
        {row.note && (
          <Button variant="ghost" disabled={busy} onClick={() => save("")}>
            Remove note
          </Button>
        )}
        <Button disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy || text.trim() === (row.note ?? "")}>
          Save note
        </Button>
      </div>
      {error && (
        <Pill tone="crit" className={styles.saidPill}>
          <span role="alert">{error}</span>
        </Pill>
      )}
    </form>
  );
}
