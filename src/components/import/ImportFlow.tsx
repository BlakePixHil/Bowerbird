"use client";

import { useId, useRef, useState } from "react";
import {
  BottomSheet,
  Button,
  ButtonLink,
  Card,
  cx,
  Divider,
  Icon,
  IconButton,
  IconButtonLink,
  Pill,
  Tile,
  Well,
} from "@/components/ui";
import { Key } from "@/components/charts/shared";
import { MAX_FILE_BYTES, TOO_BIG, type ColumnRole } from "@/lib/banks/files";
import type { ImportCheck, ImportDone, ImportProblem } from "@/lib/banks/imports/shapes";
import { FIRST_RUN_PATHS } from "@/lib/first-run/rules";
import { checkFile, importFile } from "./actions";
import styles from "./Import.module.css";
import { columnName, count, dateRange, fileSize, notUsed, number, shownSample } from "./labels";
import {
  AccountPicker,
  CardHead,
  ColumnChips,
  ColumnNote,
  ColumnTable,
  doneLine,
  DoneRows,
  doneTitle,
  DropArea,
  DropZone,
  FileCard,
  FileHelp,
  Kpis,
  NEW,
  NewHereBar,
  PreviewTable,
  ReadOnlyNote,
  RoleSelect,
  rolesOf,
  RowCard,
  SectionHead,
  SortBar,
  SortedBar,
  Steps,
  SummaryCard,
  Warnings,
  type AccountChoice,
  type Draft,
  type FileState,
} from "./parts";

/** One line of "Recent imports", ready to show. */
export type RecentShown = {
  id: string;
  filename: string;
  /** "Everyday · Sat 10 Oct" */
  meta: string;
  rows: number;
  skipped: number;
};

type Chosen = { file: File; how: "chosen" | "dropped"; version: number };
type Inputs = {
  file: Chosen | null;
  accountId: string;
  draft: Draft;
  columns: ColumnRole[] | null;
};

const OFFLINE = "That didn't reach the app. Check your connection and try again.";
const BLANK: Draft = { name: "", bank: "", kind: "everyday", joint: false };
const ACCEPT = ".csv,.txt,.ofx,.qfx,.qbo,.qif,text/csv";

/** During the first run: Continue setup goes on to payday, and back goes to step 2. */
const SETUP_NEXT = FIRST_RUN_PATHS.payday;
const SETUP_BACK = FIRST_RUN_PATHS.bring;

function formFor({ file, accountId, draft, columns }: Inputs): FormData {
  const form = new FormData();
  if (file) form.set("file", file.file);
  form.set("account", accountId);
  if (accountId === NEW) {
    form.set("name", draft.name);
    form.set("bank", draft.bank);
    form.set("kind", draft.kind);
    if (draft.joint) form.set("joint", "on");
  }
  if (columns) form.set("columns", JSON.stringify(columns));
  return form;
}

/**
 * Import a bank file, from the "Import 1, 2 and 3" phone boards and "Desktop: Import a bank
 * file". A phone goes one step at a time. A desktop shows every step at once. Both are drawn and
 * CSS shows one, and they share what the person has chosen.
 */
export function ImportFlow({
  accounts,
  recent,
  start,
  todayLabel,
  inSetup = false,
}: {
  accounts: readonly AccountChoice[];
  recent: readonly RecentShown[];
  /** The account to start on, when the page was opened from one. */
  start: string | null;
  /** "Sat 10 Oct", for the done screen. */
  todayLabel: string;
  /** Part of the first run: once a file is in, Continue setup goes on to the next step. */
  inSetup?: boolean;
}) {
  const [accountId, setAccountId] = useState(
    start && accounts.some((a) => a.id === start) ? start : (accounts[0]?.id ?? NEW),
  );
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [file, setFile] = useState<Chosen | null>(null);
  const [columns, setColumns] = useState<ColumnRole[] | null>(null);
  const [checked, setChecked] = useState<{
    version: number;
    result: ImportCheck | ImportProblem;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [done, setDone] = useState<ImportDone | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [step, setStep] = useState<"choose" | "check" | "done">("choose");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);

  const input = useRef<HTMLInputElement>(null);
  const phoneTitle = useRef<HTMLHeadingElement>(null);
  const latest = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const versions = useRef(0);
  const accountHeading = useId();
  const desktopAccountHeading = useId();

  const inputs = (change: Partial<Inputs>): Inputs => ({
    file,
    accountId,
    draft,
    columns,
    ...change,
  });

  /** Asks the server what importing would do. Only the newest answer counts. */
  function recheck(next: Inputs, wait = 0) {
    window.clearTimeout(timer.current);
    const chosen = next.file;
    if (!chosen) return;
    const ticket = ++latest.current;
    setChecking(true);
    timer.current = window.setTimeout(async () => {
      let result: ImportCheck | ImportProblem;
      if (chosen.file.size > MAX_FILE_BYTES) result = { ok: false, error: TOO_BIG };
      else {
        try {
          result = await checkFile(formFor(next));
        } catch {
          result = { ok: false, error: OFFLINE };
        }
      }
      if (ticket !== latest.current) return;
      setChecked({ version: chosen.version, result });
      setChecking(false);
    }, wait);
  }

  function pick(picked: File, how: Chosen["how"]) {
    const chosen = { file: picked, how, version: ++versions.current };
    setFile(chosen);
    setColumns(null);
    setDone(null);
    setImportError(null);
    setTableOpen(false);
    recheck(inputs({ file: chosen, columns: null }));
  }

  function clear() {
    window.clearTimeout(timer.current);
    latest.current += 1;
    setFile(null);
    setColumns(null);
    setChecked(null);
    setChecking(false);
    setDone(null);
    setImportError(null);
    setTableOpen(false);
    if (input.current) input.current.value = "";
  }

  function chooseAccount(id: string) {
    setAccountId(id);
    setImportError(null);
    recheck(inputs({ accountId: id }));
  }

  function changeDraft(next: Draft) {
    setDraft(next);
    if (next.name !== draft.name || next.bank !== draft.bank) recheck(inputs({ draft: next }), 400);
  }

  function changeRole(check: ImportCheck, index: number, role: ColumnRole) {
    const next = [...rolesOf(check, columns)];
    next[index] = role;
    setColumns(next);
    recheck(inputs({ columns: next }));
  }

  function go(to: typeof step) {
    setStep(to);
    window.scrollTo({ top: 0 });
    // The new screen's title, so a screen reader starts there.
    window.requestAnimationFrame(() => phoneTitle.current?.focus());
  }

  async function runImport() {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    let result: ImportDone | ImportProblem;
    try {
      result = await importFile(formFor(inputs({})));
    } catch {
      result = { ok: false, error: OFFLINE };
    }
    setImporting(false);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    setDone(result);
    setAccountId(result.accountId);
    setTableOpen(false);
    go("done");
  }

  function another() {
    clear();
    setDraft(BLANK);
    go("choose");
  }

  const current = checked && file && checked.version === file.version ? checked.result : null;
  const check = current?.ok ? current : null;
  const fileState: FileState =
    !current || (checking && !check)
      ? { kind: "reading" }
      : current.ok
        ? { kind: "ok", check: current }
        : { kind: "problem", error: current.error };
  const pickedName =
    accountId === NEW ? draft.name.trim() : (accounts.find((a) => a.id === accountId)?.name ?? "");
  const into = pickedName || "a new account";
  const roles = check ? rolesOf(check, columns) : [];
  const canImport =
    Boolean(check) && !checking && !importing && !check?.problem && (check?.fresh ?? 0) > 0;
  const needsName = accountId === NEW && !draft.name.trim();
  const importLabel = importing
    ? "Importing…"
    : check && check.fresh === 0
      ? "Nothing new to import"
      : `Import ${count(check?.fresh ?? 0, "transaction")}`;

  const browse = () => input.current?.click();
  const onDrop = (dropped: File) => pick(dropped, "dropped");

  const fileCard = (look: "phone" | "desktop") =>
    file && (
      <FileCard
        look={look}
        name={file.file.name}
        size={file.file.size}
        how={file.how}
        state={fileState}
        accountName={pickedName}
        imported={Boolean(done)}
        onRemove={done ? undefined : clear}
      />
    );

  const importProblem = (needsName || importError) && (
    <p role="alert" className={cx("small", styles.status, styles.problem)}>
      <Icon name="alert" size="sm" />
      {importError ?? "Give the new account a name before importing."}
    </p>
  );

  // Phone -------------------------------------------------------------------

  // Where the phone's back and close buttons go: setup's step 2 during the first run.
  const away = inSetup
    ? { href: SETUP_BACK, label: "setup" }
    : { href: "/accounts", label: "accounts and sharing" };

  const phoneChoose = (
    <>
      <div className={styles.phoneBar}>
        <IconButtonLink icon="arrow-left" label={`Back to ${away.label}`} href={away.href} />
        <Pill tone="good">Free, always works</Pill>
      </div>
      <div>
        <h1 className="h1" ref={phoneTitle} tabIndex={-1}>
          Import a bank file
        </h1>
        <p className={cx("sub", styles.lead)}>
          Works with or without live sync. Nothing is saved until you check it.
        </p>
      </div>
      <Steps at={2} />
      <SectionHead id={accountHeading} title="1. Which account is it from?" note={`Into ${into}`} />
      <Card as="section" className={styles.listCard}>
        <AccountPicker
          look="phone"
          accounts={accounts}
          value={accountId}
          onChange={chooseAccount}
          draft={draft}
          onDraft={changeDraft}
          labelledBy={accountHeading}
        />
      </Card>
      <SectionHead title="2. Choose the file" note="CSV, OFX or QIF" />
      {file ? (
        <>
          {fileCard("phone")}
          <Button variant="ghost" className={styles.another} onClick={browse}>
            Choose a different file
          </Button>
        </>
      ) : (
        <DropZone
          look="phone"
          hint="A CSV, OFX or QIF file from your bank"
          onChoose={browse}
          onDrop={onDrop}
        />
      )}
      <h2 className={cx("h3", styles.helpTitle)}>Where do I get the file?</h2>
      <Card className={styles.listCard}>
        <FileHelp firstOpen />
      </Card>
      <ReadOnlyNote />
      <div className={styles.actionBar}>
        <Button
          variant="primary"
          size="lg"
          block
          disabled={!check || checking}
          onClick={() => go("check")}
        >
          Continue
        </Button>
        {!file && <p className={cx("tiny muted", styles.actionNote)}>Choose a file to carry on</p>}
      </div>
    </>
  );

  const phoneCheck = check && (
    <>
      <div className={styles.phoneBar}>
        <IconButton
          icon="arrow-left"
          label="Back to choose the file"
          onClick={() => go("choose")}
        />
        <Pill tone="quiet" icon="eye">
          Nothing saved yet
        </Pill>
      </div>
      <div>
        <h1 className="h1" ref={phoneTitle} tabIndex={-1}>
          Check before importing
        </h1>
        <p className={cx("sub", styles.lead)}>
          Here is what the file holds and how each row will be sorted.
        </p>
      </div>
      <Steps at={3} />
      <SummaryCard check={check} sizeLabel={fileSize(check.file.size)} />
      {check.fresh === 0 && check.rows > 0 && <NothingNew check={check} />}
      <Warnings warnings={check.warnings} />
      <Card as="section" className={styles.padded} aria-labelledby="columns-title">
        <div className={styles.splitHead}>
          <h2 className="h2" id="columns-title">
            Columns we understood
          </h2>
          {check.canChangeColumns && (
            <button
              type="button"
              className={styles.link}
              aria-haspopup="dialog"
              onClick={() => setSheetOpen(true)}
            >
              Something&apos;s wrong?
            </button>
          )}
        </div>
        <ColumnChips check={check} />
        <ColumnNote check={check} />
      </Card>
      {check.firstNew.length > 0 && (
        <>
          <SectionHead
            title={`First ${check.firstNew.length} new ${check.firstNew.length === 1 ? "row" : "rows"}`}
            note={`of ${number(check.fresh)}`}
          />
          <Card className={styles.listCard}>
            <RowCard rows={check.firstNew} />
          </Card>
        </>
      )}
      {check.firstHere.length > 0 && (
        <>
          <SectionHead
            title="Already here, skipped"
            note={`${check.firstHere.length} of ${number(check.here)}`}
          />
          <Card className={styles.listCard}>
            <RowCard rows={check.firstHere} here />
          </Card>
        </>
      )}
      <p className={cx("small", styles.note)}>
        <Icon name="info" size="sm" />
        <span className="muted">
          You can change any category after importing. A rename or a rule you set later applies to
          these rows too.
        </span>
      </p>
      <div className={styles.actionBar}>
        {importProblem}
        <Button
          variant="primary"
          size="lg"
          block
          disabled={!canImport || needsName}
          onClick={runImport}
        >
          {importLabel}
        </Button>
        <p className={cx("tiny muted", styles.actionNote)}>
          {check.here > 0
            ? `The ${number(check.here)} already here ${check.here === 1 ? "is" : "are"} skipped`
            : "Nothing is saved until you import"}
        </p>
      </div>
      {check.canChangeColumns && (
        <BottomSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Which column is which"
          footer={
            <Button variant="primary" size="lg" block onClick={() => setSheetOpen(false)}>
              Looks right now
            </Button>
          }
        >
          <p className={cx("small sub", styles.sheetLead)}>
            Each column in {check.file.name}, its first value, and what we read it as. Tap one to
            change it.
          </p>
          <ul className={styles.sheetColumns}>
            {check.columns.map((column, i) => {
              const name = columnName(column, i);
              return (
                <li key={i}>
                  <div className={styles.sheetColumn}>
                    <div className="mono">{name}</div>
                    <div className={cx("mono ellipsis", styles.sample)}>
                      {shownSample(column.sample)}
                    </div>
                  </div>
                  <RoleSelect
                    look="phone"
                    label={`Column ${name}, read as`}
                    value={roles[i] ?? "ignore"}
                    onChange={(role) => changeRole(check, i, role)}
                  />
                </li>
              );
            })}
          </ul>
          <ColumnNote check={check} />
          {notUsed(check.columns.map((c, i) => ({ ...c, role: roles[i] ?? c.role }))) && (
            <p className={cx("small muted", styles.notUsed)}>
              {notUsed(check.columns.map((c, i) => ({ ...c, role: roles[i] ?? c.role })))}
            </p>
          )}
        </BottomSheet>
      )}
    </>
  );

  const phoneDone = done && (
    <>
      <div className={styles.phoneBar}>
        <IconButtonLink
          icon="close"
          label={`Close and go back to ${away.label}`}
          href={away.href}
        />
        <span className="muted small">{todayLabel}</span>
      </div>
      <div className={styles.doneHead}>
        <Tile icon="check" size="lg" tone="good" />
        <h1 className="h1" ref={phoneTitle} tabIndex={-1}>
          {doneTitle(done)}
        </h1>
        <p className="sub">{doneLine(done)}</p>
      </div>
      <Card as="section" className={styles.padded} aria-labelledby="happened-title">
        <div className={styles.splitHead}>
          <h2 className="h2" id="happened-title">
            What happened
          </h2>
          <span className="muted small tnum">{count(done.rows, "row")} in the file</span>
        </div>
        <SortedBar done={done} />
        <DoneRows done={done} />
      </Card>
      <Well className={styles.safeNote}>
        <Icon name="shield-plain" size="sm" />
        <span className="small sub">
          Next time, it is safe to import the same file again, or one that overlaps. Rows already
          here are skipped, so nothing is counted twice.
        </span>
      </Well>
      <div className={styles.actionBar}>
        {inSetup ? (
          <ButtonLink variant="primary" size="lg" block href={SETUP_NEXT}>
            Continue setup
            <Icon name="chevron-right" size="sm" />
          </ButtonLink>
        ) : (
          done.toCheck > 0 && (
            <ButtonLink variant="primary" size="lg" block href="/activity">
              Sort the {number(done.toCheck)}
              <Icon name="chevron-right" size="sm" />
            </ButtonLink>
          )
        )}
        <div className={styles.pair}>
          <Button size="lg" onClick={another}>
            Import another file
          </Button>
          <ButtonLink size="lg" href="/activity">
            Go to Activity
          </ButtonLink>
        </div>
      </div>
    </>
  );

  const phoneStep =
    step === "done" && phoneDone ? "done" : step === "check" && check ? "check" : "choose";

  // Desktop -----------------------------------------------------------------

  const range = check ? dateRange(check.from, check.to) : null;
  const checkNote = !file
    ? "Waiting for a file"
    : [file.file.name, range].filter(Boolean).join(" · ");

  const pending: RecentShown | null =
    file && check && !done
      ? {
          id: "pending",
          filename: file.file.name,
          meta: `${into} · ${file.how} just now`,
          rows: check.rows,
          skipped: check.here,
        }
      : null;

  const desktop = (
    <>
      <div className={styles.flow}>
        <Card as="section" className={cx(styles.w1, styles.setup)} aria-label="Account and file">
          <div className={styles.cardHead}>
            <span className={styles.number} aria-hidden="true">
              1
            </span>
            <h2 className="h2 grow" id={desktopAccountHeading}>
              Which account is it from?
            </h2>
          </div>
          <AccountPicker
            look="desktop"
            accounts={accounts}
            value={accountId}
            onChange={chooseAccount}
            draft={draft}
            onDraft={changeDraft}
            labelledBy={desktopAccountHeading}
          />
          <Divider className={styles.split} />
          <CardHead n={2} title="The file" note="CSV, OFX or QIF" />
          {file ? (
            <DropArea className={styles.fileArea} onDrop={onDrop}>
              {fileCard("desktop")}
              <span className={cx("tiny muted", styles.centre)}>
                {done
                  ? "Drop another file here to import more"
                  : "Drop another file here to replace it"}
              </span>
            </DropArea>
          ) : (
            <DropZone
              look="desktop"
              hint={`A CSV, OFX or QIF file from your bank, into ${into}`}
              onChoose={browse}
              onDrop={onDrop}
            />
          )}
          <h3 className={cx("h3", styles.helpTitle)}>Where do I get the file?</h3>
          <FileHelp firstOpen={false} />
        </Card>

        <div className={cx(styles.w2, styles.column)}>
          <Card as="section" className={styles.padded} aria-label="Check before importing">
            <CardHead n={3} title={done ? "Imported" : "Check before importing"} note={checkNote} />
            {!file ? (
              <EmptyCheck />
            ) : !check ? (
              <div className={styles.waiting}>
                {fileState.kind === "problem" ? (
                  <p role="alert" className={cx("small", styles.status, styles.problem)}>
                    <Icon name="alert" size="sm" />
                    {fileState.error}
                  </p>
                ) : (
                  <p role="status" className="small muted">
                    Reading the file…
                  </p>
                )}
              </div>
            ) : (
              <>
                <Kpis check={check} done={done} />
                {check.fresh === 0 && check.rows > 0 && !done && <NothingNew check={check} />}
                <Warnings warnings={check.warnings} />
                <div className={styles.barBlock}>
                  <NewHereBar check={check} height={12} />
                  <ul className={styles.legend}>
                    <li>
                      <Key colour="accent" kind="square" />
                      {done ? "Imported" : "New, will be imported"}{" "}
                      <span className={styles.legendValue}>
                        {number(done ? done.imported : check.fresh)}
                      </span>
                    </li>
                    <li>
                      <Key colour="ghost" kind="square" />
                      Already here, skipped{" "}
                      <span className={styles.legendValue}>
                        {number(done ? done.skipped : check.here)}
                      </span>
                    </li>
                    <li className="muted">Same date, amount and description as a row in the app</li>
                  </ul>
                </div>
                <SortBar sorts={check.sorts} done={Boolean(done)} />
                <div className={styles.divided}>
                  <div className={styles.splitHead}>
                    <span className="small sub">Columns we understood</span>
                    {check.canChangeColumns && !done && (
                      <button
                        type="button"
                        className={styles.link}
                        aria-expanded={tableOpen}
                        onClick={() => setTableOpen(!tableOpen)}
                      >
                        {tableOpen ? "Hide columns" : "Something’s wrong?"}
                      </button>
                    )}
                  </div>
                  <ColumnChips check={check} small />
                  <ColumnNote check={check} />
                </div>
                {tableOpen && check.canChangeColumns && !done && (
                  <ColumnTable
                    check={check}
                    roles={roles}
                    onRole={(index, role) => changeRole(check, index, role)}
                  />
                )}
                {done ? (
                  <DoneWell done={done} onAnother={another} inSetup={inSetup} />
                ) : (
                  <div className={cx(styles.divided, styles.actions)}>
                    {importProblem}
                    <Button
                      variant="primary"
                      size="lg"
                      icon="upload"
                      disabled={!canImport || needsName}
                      onClick={runImport}
                    >
                      {importLabel}
                    </Button>
                    <Button variant="ghost" size="lg" onClick={clear}>
                      Cancel
                    </Button>
                    <span className={cx("small muted", styles.actionsNote)}>
                      Nothing is saved until you import.
                      {check.here > 0 &&
                        ` The ${number(check.here)} already here ${check.here === 1 ? "is" : "are"} skipped.`}
                    </span>
                  </div>
                )}
              </>
            )}
          </Card>

          <RecentCard recent={pending ? [pending, ...recent] : recent} />
        </div>
      </div>
      {check && <PreviewTable check={check} done={Boolean(done)} accountName={pickedName} />}
    </>
  );

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) pick(picked, "chosen");
        }}
      />
      <div className={styles.phone}>
        {phoneStep === "done" ? phoneDone : phoneStep === "check" ? phoneCheck : phoneChoose}
      </div>
      <div className={styles.desktop}>{desktop}</div>
    </>
  );
}

function NothingNew({ check }: { check: ImportCheck }) {
  return (
    <p role="status" className={cx("small", styles.status, styles.good, styles.nothingNew)}>
      <Icon name="check-double" size="sm" />
      {check.rows === 1
        ? "This row is already here, so there's nothing to import."
        : `All ${number(check.rows)} rows are already here, so there's nothing to import.`}
    </p>
  );
}

/** The check card before a file is chosen. */
function EmptyCheck() {
  return (
    <>
      <div className={styles.empty}>
        <div className={styles.ghostRows} aria-hidden="true">
          {[52, 38, 46].map((width) => (
            <span key={width}>
              <span className={styles.ghostDot} />
              <span className={styles.ghostBar} style={{ flexBasis: `${width}%` }} />
              <span className={styles.ghostAmount} />
            </span>
          ))}
        </div>
        <p className={styles.emptyTitle}>Nothing to check yet</p>
        <p className={cx("small sub", styles.emptyText)}>
          Pick the account and drop a file. Before anything is saved, you will see how many rows are
          new, which are already here, and the category each one will get.
        </p>
      </div>
      <div className={styles.actions}>
        <Button variant="primary" size="lg" disabled>
          Import
        </Button>
        <span className="small muted">Rows already here are always skipped.</span>
      </div>
    </>
  );
}

/** The result on desktop, in the check card. */
function DoneWell({
  done,
  onAnother,
  inSetup,
}: {
  done: ImportDone;
  onAnother: () => void;
  inSetup: boolean;
}) {
  const skipped =
    done.skipped > 0
      ? ` The ${number(done.skipped)} already here ${done.skipped === 1 ? "was" : "were"} skipped.`
      : "";
  return (
    <Well role="status" className={styles.doneWell}>
      <div className={styles.doneWellHead}>
        <Tile icon="check" tone="good" />
        <div className="grow">
          <div className={styles.doneWellTitle}>{doneTitle(done)}</div>
          <div className="small sub">
            Into {done.accountName} just now.{skipped}
          </div>
        </div>
      </div>
      <SortedBar done={done} height={8} />
      {done.imported > 0 && (
        <ul className={styles.doneStats}>
          <li>
            <span className={cx("small sub", styles.kpiLabel)}>
              <Key colour="accent" kind="square" />
              Sorted automatically
            </span>
            <span className="mid tnum">{number(done.sorted)}</span>
            <span className="tiny muted">By your categories and rules</span>
          </li>
          <li>
            <span className={cx("small", styles.kpiLabel, styles.warnInk)}>
              <Icon name="info" size="sm" className={styles.kpiIcon} />
              To check
            </span>
            <span className="mid tnum">{number(done.toCheck)}</span>
            {done.toCheck > 0 ? (
              <a className={styles.link} href="/activity">
                Sort them in Activity
              </a>
            ) : (
              <span className="tiny muted">Nothing left to sort</span>
            )}
          </li>
          <li>
            <span className={cx("small sub", styles.kpiLabel)}>
              <Icon name="transfer" size="sm" className={styles.kpiIcon} />
              Transfers, not counted
            </span>
            <span className="mid tnum">{number(done.transfers)}</span>
            <span className="tiny muted">Not in spending</span>
          </li>
        </ul>
      )}
      <div className={styles.actions}>
        {inSetup ? (
          <ButtonLink variant="primary" href={SETUP_NEXT}>
            Continue setup
            <Icon name="chevron-right" size="sm" />
          </ButtonLink>
        ) : (
          done.toCheck > 0 && (
            <ButtonLink variant="primary" href="/activity">
              Sort the {number(done.toCheck)}
              <Icon name="chevron-right" size="sm" />
            </ButtonLink>
          )
        )}
        <Button onClick={onAnother}>Import another file</Button>
        <span className={cx("small muted", styles.actionsNote)}>
          Safe to import the same file again. Rows already here are skipped.
        </span>
      </div>
    </Well>
  );
}

function RecentCard({ recent }: { recent: readonly RecentShown[] }) {
  return (
    <Card as="section" className={styles.recent} aria-labelledby="recent-title">
      <div className={styles.recentHead}>
        <h2 className="h2" id="recent-title">
          Recent imports
        </h2>
        <span className="muted small">Rows already here are skipped every time</span>
      </div>
      {recent.length === 0 ? (
        <p className={cx("small muted", styles.recentEmpty)}>
          Nothing imported yet. Files you import show up here.
        </p>
      ) : (
        <ul className={styles.recentList}>
          {recent.map((item) => (
            <li key={item.id}>
              <Tile icon="file" size="sm" />
              <div className={styles.recentText}>
                <div className={cx("ellipsis", styles.rowName)}>{item.filename}</div>
                <div className="muted small">{item.meta}</div>
              </div>
              {item.id === "pending" ? (
                <Pill tone="accent" icon="eye">
                  Checking, not saved
                </Pill>
              ) : (
                <span className={cx("small tnum", styles.recentCounts)}>
                  <span>
                    <strong>{number(item.rows)}</strong> <span className="muted">rows</span>
                  </span>
                  <span>
                    <strong>{number(item.skipped)}</strong> <span className="muted">skipped</span>
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
