"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { count, KIND_LABEL, accountIcon } from "@/components/import/labels";
import {
  Button,
  Card,
  cx,
  Icon,
  Money,
  SegmentedControl,
  Switch,
  Tag,
  Tile,
  Well,
  type IconName,
  type SegmentOption,
} from "@/components/ui";
import { startingVisibility, type LiveAccount, type Visibility } from "@/lib/banks/live/shapes";
import { bringInAccounts } from "./actions";
import styles from "./Connect.module.css";
import { ConsentNote, PhoneTop, StepRail } from "./parts";
import pick from "./Pick.module.css";

type Choice = { include: boolean; isJoint: boolean; visibility: Visibility; touched: boolean };

const OPTIONS: readonly SegmentOption<Visibility>[] = [
  { value: "shared", label: "Shared", icon: "users" },
  { value: "balance_only", label: "Balance only", icon: "eye" },
  { value: "private", label: "Private", icon: "lock" },
];
const PLAIN_OPTIONS = OPTIONS.map(({ value, label }) => ({ value, label }));

const NOTE =
  "Joint accounts start as Shared and your own start as Private. You can change any of this later in Accounts and sharing.";

function legend(partner: string | null): { icon: IconName; label: string; text: string }[] {
  return [
    {
      icon: "users",
      label: "Shared",
      text: "Balance and transactions. Counts toward household budgets.",
    },
    {
      icon: "eye",
      label: "Balance only",
      text: "The balance, counted in what you own and owe. No transactions.",
    },
    {
      icon: "lock",
      label: "Private",
      text: partner ? `Only you see it. ${partner} sees nothing.` : "Only you see it.",
    },
  ];
}

/** "Yours · everyday" or "Joint · home loan". */
const meta = (account: LiveAccount, isJoint: boolean) =>
  `${isJoint ? "Joint" : "Yours"} · ${KIND_LABEL[account.kind].toLowerCase()}`;

/**
 * Live sync step 2 of 3: tick the accounts to bring in, say which are joint, and choose who can
 * see each. Drawn for the phone and desktop boards; CSS shows one.
 */
export function PickAccounts({
  connectionId,
  accounts,
  partner,
}: {
  connectionId: string;
  accounts: readonly LiveAccount[];
  /** The other member's name, or null while no one else is in the household. */
  partner: string | null;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(
      accounts.map((account) => [
        account.externalId,
        {
          include: account.included,
          isJoint: account.isJoint,
          visibility: account.visibility,
          touched: account.saved,
        },
      ]),
    ),
  );

  const change = (id: string, next: Partial<Choice>) => {
    setError(null);
    setChoices((all) => ({ ...all, [id]: { ...all[id], ...next } }));
  };
  const setJoint = (id: string, isJoint: boolean) => {
    // Until the person picks who can see it, joint goes with Shared and their own with Private.
    const choice = choices[id];
    change(id, choice.touched ? { isJoint } : { isJoint, visibility: startingVisibility(isJoint) });
  };

  const picked = accounts.filter((a) => choices[a.externalId].include);
  const seen = picked.filter((a) => choices[a.externalId].visibility !== "private").length;
  const banks = groupByBank(accounts);
  const named = banks.filter((bank) => bank.name !== null).length;
  const found = `Your setup token opened ${count(accounts.length, "account")}${named > 0 ? ` at ${count(named, "bank")}` : ""}`;
  const seeLine =
    picked.length === 0
      ? "Nothing picked yet"
      : partner
        ? `${partner} will see ${seen} of the ${picked.length} you bring in`
        : "No one else is in your household yet";
  const cta = busy ? "Saving…" : `Bring in ${count(picked.length, "account")}`;

  function save() {
    if (picked.length === 0 || busy) return;
    const picks = accounts.map((account) => {
      const { include, isJoint, visibility } = choices[account.externalId];
      return { externalId: account.externalId, include, isJoint, visibility };
    });
    startTransition(async () => {
      const answer = await bringInAccounts(connectionId, picks);
      if (answer.ok) router.push(answer.next);
      else setError(answer.error);
    });
  }

  const action = (className: string, size: "lg" | "md") =>
    picked.length > 0 ? (
      <Button
        variant="primary"
        size={size}
        block={size === "lg"}
        disabled={busy}
        onClick={save}
        className={className}
      >
        {cta}
      </Button>
    ) : (
      <Button variant="primary" size={size} block={size === "lg"} disabled className={className}>
        Tick at least one account
      </Button>
    );

  const problem = error && (
    <p role="alert" className={cx("small", styles.problem)}>
      <Icon name="alert" size="sm" />
      {error}
    </p>
  );

  // Phone -------------------------------------------------------------------

  const phone = (
    <div className={styles.phone}>
      <PhoneTop step={2} back={{ href: "/accounts", label: "Back to accounts and sharing" }} />
      <div className={styles.intro}>
        <h1 className="h1">Pick the accounts to bring in</h1>
        <p className={cx("sub", styles.lead)}>
          {found}. Tick the ones you want, then choose who can see each.
        </p>
      </div>
      {banks.map((bank) => (
        <section key={bank.key} aria-label={bank.label} className={pick.bank}>
          <div className={pick.bankHead}>
            <h2 className="h2">{bank.label}</h2>
            <span className="muted small">{count(bank.accounts.length, "account")}</span>
          </div>
          <Card as="ul" className={pick.list}>
            {bank.accounts.map((account) => {
              const choice = choices[account.externalId];
              return (
                <li key={account.externalId} className={pick.item}>
                  <div className={pick.top}>
                    <Tick
                      name={account.name}
                      on={choice.include}
                      onChange={(include) => change(account.externalId, { include })}
                    />
                    <span className={cx(pick.faded, !choice.include && pick.out)}>
                      <Tile
                        size="sm"
                        icon={accountIcon({ kind: account.kind, isJoint: choice.isJoint })}
                      />
                    </span>
                    <span className={cx("grow", pick.faded, !choice.include && pick.out)}>
                      <span className={cx("ellipsis", pick.name)}>{account.name}</span>
                      <span className="muted small">{meta(account, choice.isJoint)}</span>
                    </span>
                    <Money
                      cents={account.balanceCents}
                      decimals="never"
                      className={cx(pick.faded, !choice.include && pick.out)}
                    />
                  </div>
                  {choice.include ? (
                    <div className={pick.choose}>
                      <SegmentedControl
                        label={`Who can see ${account.name}`}
                        options={OPTIONS}
                        value={choice.visibility}
                        size="sm"
                        onChange={(visibility) =>
                          change(account.externalId, { visibility, touched: true })
                        }
                      />
                      <Switch
                        checked={choice.isJoint}
                        onChange={(event) => setJoint(account.externalId, event.target.checked)}
                        className={pick.joint}
                      >
                        Joint account
                      </Switch>
                    </div>
                  ) : (
                    <LeftOut long />
                  )}
                </li>
              );
            })}
          </Card>
        </section>
      ))}
      <Well as="section" aria-labelledby="who-title" className={pick.legend}>
        <h2 id="who-title" className="h3">
          Who can see it
        </h2>
        <ul>
          {legend(partner).map((item) => (
            <li key={item.label}>
              <Icon name={item.icon} size="sm" />
              <span className="small">
                <span className={pick.legendLabel}>{item.label}.</span>{" "}
                <span className="sub">{item.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Well>
      <p className={cx("muted small", pick.note)}>{NOTE}</p>
      <div className={styles.phoneActions}>
        <div className={cx("small", pick.see)}>
          <Icon name="users" size="sm" />
          <span>{seeLine}</span>
        </div>
        {action("", "lg")}
        {problem}
      </div>
    </div>
  );

  // Desktop -----------------------------------------------------------------

  const groups = [
    {
      key: "shared",
      icon: "users" as const,
      title: "Counted in household budgets",
      sub: `Shared: ${partner ?? "anyone who joins"} sees the balance and transactions`,
      items: picked.filter((a) => choices[a.externalId].visibility === "shared"),
    },
    {
      key: "balance_only",
      icon: "eye" as const,
      title: "Balance only",
      sub: "Counted in what you own and owe, no transactions",
      items: picked.filter((a) => choices[a.externalId].visibility === "balance_only"),
    },
    {
      key: "private",
      icon: "lock" as const,
      title: "Stays private",
      sub: "Only you see these",
      items: picked.filter((a) => choices[a.externalId].visibility === "private"),
    },
    {
      key: "out",
      icon: "minus-circle" as const,
      title: "Left out",
      sub: "Nothing from these comes in",
      items: accounts.filter((a) => !choices[a.externalId].include),
    },
  ].filter((group) => group.key !== "out" || group.items.length > 0);

  const desktop = (
    <div className={styles.desktop}>
      <StepRail at="pick" subs={{ pick: `${accounts.length} found` }} />
      <div className={styles.layout}>
        <div className={styles.main}>
          <Card as="section" className={pick.card} aria-labelledby="pick-title">
            <div className={pick.cardHead}>
              <div>
                <h2 id="pick-title" className={cx("h2", styles.sectionTitle)}>
                  Pick the accounts to bring in
                </h2>
                <div className="muted small">{found}</div>
              </div>
              <span className="small sub tnum">
                {picked.length} of {accounts.length} ticked
              </span>
            </div>
            <div role="table" aria-label="Accounts behind the setup token" className={pick.table}>
              <div role="row" className={cx("small muted", pick.row, pick.head)}>
                <span role="columnheader">Account</span>
                <span role="columnheader" className={pick.wide}>
                  Bank and type
                </span>
                <span role="columnheader" className={pick.center}>
                  Joint
                </span>
                <span role="columnheader" className={pick.right}>
                  Balance
                </span>
                <span role="columnheader" className={pick.center}>
                  Bring in
                </span>
                <span role="columnheader">Who can see it</span>
              </div>
              {accounts.map((account) => {
                const choice = choices[account.externalId];
                const out = !choice.include && pick.out;
                return (
                  <div role="row" key={account.externalId} className={pick.row}>
                    <span role="cell" className={cx(pick.cellAccount, pick.faded, out)}>
                      <Tile
                        size="sm"
                        icon={accountIcon({ kind: account.kind, isJoint: choice.isJoint })}
                      />
                      <span className="grow">
                        <span className={cx("ellipsis", pick.name)}>{account.name}</span>
                        <span className={cx("muted small ellipsis", styles.block)}>
                          {choice.isJoint ? "Joint" : "Yours"}
                          <span className={pick.more}>
                            {account.institution ? ` · ${account.institution}` : ""} ·{" "}
                            {KIND_LABEL[account.kind]}
                          </span>
                        </span>
                      </span>
                    </span>
                    <span role="cell" className={cx("small", pick.wide, pick.faded, out)}>
                      <span className={cx("sub ellipsis", styles.block)}>
                        {account.institution ?? "Bank not given"}
                      </span>
                      <span className={cx("muted", styles.block)}>{KIND_LABEL[account.kind]}</span>
                    </span>
                    <span role="cell" className={cx(pick.center, pick.jointCell)}>
                      <Switch
                        checked={choice.isJoint}
                        disabled={!choice.include}
                        onChange={(event) => setJoint(account.externalId, event.target.checked)}
                      >
                        <span className={pick.jointWords}>Joint</span>
                        <span className="sr-only">{account.name} is a joint account</span>
                      </Switch>
                    </span>
                    <span role="cell" className={cx(pick.right, pick.balance, pick.faded, out)}>
                      <Money cents={account.balanceCents} decimals="never" />
                    </span>
                    <span role="cell" className={cx(pick.center, pick.include)}>
                      <Tick
                        name={account.name}
                        on={choice.include}
                        onChange={(include) => change(account.externalId, { include })}
                      />
                    </span>
                    <span role="cell" className={pick.vis}>
                      {choice.include ? (
                        <SegmentedControl
                          label={`Who can see ${account.name}`}
                          options={PLAIN_OPTIONS}
                          value={choice.visibility}
                          size="sm"
                          className={pick.seg}
                          onChange={(visibility) =>
                            change(account.externalId, { visibility, touched: true })
                          }
                        />
                      ) : (
                        <LeftOut />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <ul className={pick.legendRow} aria-label="What each choice means">
              {legend(partner).map((item) => (
                <li key={item.label}>
                  <Icon name={item.icon} size="sm" />
                  <span className="small">
                    <span className={cx(pick.legendLabel, styles.block)}>{item.label}</span>
                    <span className="sub">{item.text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className={pick.foot}>
              <span className="muted small">{NOTE}</span>
              <div className={pick.footActions}>{action("", "md")}</div>
              {problem}
            </div>
          </Card>
        </div>
        <aside className={styles.aside} aria-label="About this step">
          <Card as="section" className={styles.side} aria-labelledby="means-title">
            <h2 id="means-title" className="h2">
              What this means
            </h2>
            <div className="muted small">{seeLine}</div>
            <div className={pick.groups}>
              {groups.map((group) => (
                <div key={group.key} className={pick.group}>
                  <div className={pick.groupHead}>
                    <Icon name={group.icon} size="sm" />
                    <span className={cx("small grow", pick.legendLabel)}>{group.title}</span>
                    <Tag>{group.items.length}</Tag>
                  </div>
                  <div className={cx("muted tiny", pick.groupSub)}>{group.sub}</div>
                  <ul className={pick.groupItems}>
                    {group.items.map((account) => (
                      <li key={account.externalId} className="small">
                        <span className="ellipsis">{account.name}</span>
                        <Money cents={account.balanceCents} decimals="never" className="sub" />
                      </li>
                    ))}
                    {group.items.length === 0 && <li className="small muted">None</li>}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
          <ConsentNote />
        </aside>
      </div>
    </div>
  );

  return (
    <>
      {phone}
      {desktop}
    </>
  );
}

/** The accounts grouped by the bank the provider says each is at, in the provider's order. */
function groupByBank(accounts: readonly LiveAccount[]) {
  const banks = new Map<string, { key: string; name: string | null; accounts: LiveAccount[] }>();
  for (const account of accounts) {
    const key = account.institution ?? "";
    const bank = banks.get(key) ?? { key: key || "none", name: account.institution, accounts: [] };
    bank.accounts.push(account);
    banks.set(key, bank);
  }
  const list = [...banks.values()];
  const anyNamed = list.some((bank) => bank.name);
  return list.map((bank) => ({
    ...bank,
    label: bank.name ?? (anyNamed ? "Other accounts" : "Your accounts"),
  }));
}

/** The tick box for bringing an account in. A real checkbox, named for the account. */
function Tick({
  name,
  on,
  onChange,
}: {
  name: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className={pick.tick}>
      <input
        type="checkbox"
        className="sr-only"
        checked={on}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={pick.box} aria-hidden="true">
        <Icon name="check" size="sm" />
      </span>
      <span className="sr-only">Bring in {name}</span>
    </label>
  );
}

function LeftOut({ long = false }: { long?: boolean }) {
  return (
    <span className={cx("small muted", pick.leftOut)}>
      <Icon name="minus-circle" size="sm" />
      <span>{long ? "Left out. Nothing from it comes in." : "Left out"}</span>
    </span>
  );
}
