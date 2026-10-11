"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { useOnline } from "@/components/offline/online";
import {
  Button,
  cx,
  IconButton,
  Money,
  Pill,
  Switch,
  TextField,
  Tile,
  type IconName,
} from "@/components/ui";
import { ACCOUNT_NAME_MAX } from "@/lib/access/limits";
import { saveAccount } from "./actions";
import styles from "./Accounts.module.css";

/** One of your accounts, ready to show. */
export type AccountItem = {
  id: string;
  name: string;
  /** "Yours · Westpac · live sync". */
  line: string;
  icon: IconName;
  balanceCents: number | null;
  includeInBudgets: boolean;
  archived: boolean;
  live: boolean;
};

const OFFLINE = "Changes need a connection.";
const FAILED = "Couldn't save that. Check your connection and try again.";

/**
 * Your accounts on Accounts and sharing, from the "Accounts and sharing" boards: each with its
 * balance and whether it counts toward budgets, where the boards put who can see it (that joins in
 * project 07). The pencil renames or archives one. Archived accounts wait at the bottom to be
 * brought back.
 */
export function AccountsList({ accounts }: { accounts: readonly AccountItem[] }) {
  const router = useRouter();
  const online = useOnline();
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, startSaving] = useTransition();
  // Switches move at once and go back if the save doesn't work.
  const [counting, setCounting] = useState<Record<string, boolean>>({});

  const open = accounts.filter((account) => !account.archived);
  const archived = accounts.filter((account) => account.archived);

  function save(
    change: Parameters<typeof saveAccount>[0],
    done: (name: string) => string,
    undo?: () => void,
  ) {
    setNotice(null);
    setProblem(null);
    startSaving(async () => {
      let saved;
      try {
        saved = await saveAccount(change);
      } catch {
        saved = { ok: false as const, error: FAILED };
      }
      if (!saved.ok) {
        undo?.();
        setProblem(saved.error);
        return;
      }
      setNotice(done(saved.name));
      setEditing(null);
      router.refresh();
    });
  }

  function count(account: AccountItem, on: boolean) {
    setCounting((now) => ({ ...now, [account.id]: on }));
    save(
      { accountId: account.id, includeInBudgets: on },
      (name) =>
        on ? `${name} counts toward budgets.` : `${name} no longer counts toward budgets.`,
      () => setCounting((now) => ({ ...now, [account.id]: !on })),
    );
  }

  return (
    <>
      <div className={styles.status} role="status">
        {notice && <Pill tone="good">{notice}</Pill>}
      </div>
      {problem && (
        <p role="alert" className={cx("small", styles.problem)}>
          {problem}
        </p>
      )}
      {!online && <p className={cx("small muted", styles.offline)}>{OFFLINE}</p>}

      <ul className={styles.accounts} aria-label="Your accounts">
        {open.map((account) => {
          const counts = counting[account.id] ?? account.includeInBudgets;
          return (
            <li key={account.id} className={styles.account}>
              <div className={styles.accountRow}>
                <span className={styles.accountName}>
                  <Tile icon={account.icon} size="sm" />
                  <span className="grow">
                    <span className={cx("ellipsis", styles.name)}>{account.name}</span>
                    <span className={cx("small muted", styles.line)}>{account.line}</span>
                  </span>
                </span>
                <span className={styles.balance}>
                  {account.balanceCents === null ? (
                    <span className="muted small">No balance yet</span>
                  ) : (
                    <Money cents={account.balanceCents} decimals="never" />
                  )}
                </span>
                <Switch
                  checked={counts}
                  disabled={!online || busy}
                  onChange={(event) => count(account, event.currentTarget.checked)}
                  className={cx("small", styles.counts)}
                  aria-label={`${account.name} counts toward budgets`}
                >
                  Counts toward budgets
                </Switch>
                <IconButton
                  icon="pencil"
                  label={`Rename or archive ${account.name}`}
                  aria-expanded={editing === account.id}
                  aria-controls={`edit-${account.id}`}
                  onClick={() => {
                    setProblem(null);
                    setEditing(editing === account.id ? null : account.id);
                  }}
                  className={styles.edit}
                />
              </div>
              {editing === account.id && (
                <AccountEditor
                  account={account}
                  disabled={!online || busy}
                  onRename={(name) =>
                    save({ accountId: account.id, name }, (saved) => `Renamed to ${saved}.`)
                  }
                  onArchive={() =>
                    save(
                      { accountId: account.id, archived: true },
                      (name) => `Archived ${name}. It's under Archived if you need it back.`,
                    )
                  }
                  onCancel={() => setEditing(null)}
                />
              )}
            </li>
          );
        })}
      </ul>

      {archived.length > 0 && (
        <section aria-labelledby="archived-title" className={styles.archived}>
          <h3 id="archived-title" className={cx("small", styles.archivedTitle)}>
            Archived
          </h3>
          <p className="muted small">
            Gone from your account lists and the import picker, and live sync doesn&apos;t bring in
            anything new. Their transactions stay where they are.
          </p>
          <ul className={styles.accounts} aria-label="Archived accounts">
            {archived.map((account) => (
              <li key={account.id} className={cx(styles.accountRow, styles.archivedRow)}>
                <span className={styles.accountName}>
                  <Tile icon={account.icon} size="sm" />
                  <span className="grow">
                    <span className={cx("ellipsis", styles.name)}>{account.name}</span>
                    <span className={cx("small muted", styles.line)}>{account.line}</span>
                  </span>
                </span>
                <Button
                  disabled={!online || busy}
                  onClick={() =>
                    save({ accountId: account.id, archived: false }, (name) =>
                      account.live
                        ? `${name} is back. Live sync brings it up to date next time.`
                        : `${name} is back.`,
                    )
                  }
                  aria-label={`Bring back ${account.name}`}
                >
                  Bring back
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function AccountEditor({
  account,
  disabled,
  onRename,
  onArchive,
  onCancel,
}: {
  account: AccountItem;
  disabled: boolean;
  onRename: (name: string) => void;
  onArchive: () => void;
  onCancel: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("name");
    onRename(typeof name === "string" ? name : "");
  }
  return (
    <form id={`edit-${account.id}`} onSubmit={submit} className={styles.editor}>
      <TextField
        label="Name"
        name="name"
        defaultValue={account.name}
        maxLength={ACCOUNT_NAME_MAX}
        required
        autoComplete="off"
        autoFocus
        hint={
          account.live
            ? "Only here. Your bank keeps its own name, and live sync won't change this one."
            : "Only here. Your bank keeps its own name."
        }
      />
      <div className={styles.editorActions}>
        <Button
          variant="ghost"
          icon="box"
          disabled={disabled}
          onClick={onArchive}
          className={styles.archive}
        >
          Archive
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={disabled}>
          Save
        </Button>
      </div>
    </form>
  );
}
