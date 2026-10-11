import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { AccountsList } from "@/components/accounts/AccountsList";
import { LiveSyncCard } from "@/components/accounts/LiveSyncCard";
import { accountItems, lastImport, passkeyItems, sortingCounts } from "@/components/accounts/load";
import { Passkeys } from "@/components/accounts/Passkeys";
import { categoriesLine, roleLine } from "@/components/accounts/words";
import { SignOutButton } from "@/components/auth/AccountActions";
import { payHeadline } from "@/components/paydays/paydays";
import { getShell, PageHeader } from "@/components/shell";
import {
  Avatar,
  ButtonLink,
  Card,
  cx,
  EmptyState,
  Icon,
  ListRow,
  Pill,
  Tag,
  Tile,
  type IconName,
} from "@/components/ui";
import { FEATURES } from "@/config/features";
import { paydaysOf, viewerOf } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { signInWords } from "@/lib/auth/device";
import { getDb } from "@/lib/db";
import { formatShortDate, mainIncome, paydayAfter } from "@/lib/money";
import styles from "@/components/accounts/Accounts.module.css";

export const metadata: Metadata = { title: "Accounts and sharing" };

/* Investing apps, Household members and AI help join both lists below when their projects ship
   (projects 10, 07 and 12), as do Export everything and Delete the household with their actions. */

/** Notifications join the install row in project 08. */
const HOME_SCREEN = FEATURES.notifications
  ? { title: "Notifications and Home Screen", icon: "bell" as IconName }
  : { title: "Install the app", icon: "install-phone" as IconName };

/**
 * Accounts and sharing, from the boards "Accounts and sharing" and "Desktop: Accounts and
 * sharing": who you are, live sync, your accounts and whether each counts toward budgets, file
 * imports, then the rest of the settings. A phone lists the rest as rows that open their pages;
 * desktop lays them out as sections, with a list of them to jump to.
 */
export default async function AccountsPage() {
  const shell = await getShell();
  const me = await requireMember();
  const db = getDb();
  const viewer = viewerOf(me);
  const [accounts, keys, last, paydays, sorting, h] = await Promise.all([
    accountItems(db, viewer),
    passkeyItems(db, me.user.id, shell.timeZone),
    lastImport(db, viewer),
    paydaysOf(db, viewer),
    sortingCounts(db, viewer),
    headers(),
  ]);
  const pay = mainIncome(paydays.incomes);
  const payLine = pay
    ? `${payHeadline({ amountCents: pay.amountCents, accountName: null, schedule: pay })}, next ${formatShortDate(paydayAfter(pay, shell.today))}.`
    : "Not set yet. Until payday and your budgets line up with your pay once it is.";
  const keysLine =
    keys.length === 0
      ? "None yet. Add one so this device signs in by itself."
      : keys.length === 1
        ? `1 passkey, on ${keys[0].label}. Add another device, or remove one.`
        : `${keys.length} passkeys: ${new Intl.ListFormat("en-AU").format(keys.map((key) => key.label))}. Add another device, or remove one.`;
  const sections: { id: string; label: string; icon: IconName; className?: string }[] = [
    { id: "sync", label: "Bank connections", icon: "sync" },
    { id: "accounts", label: "Your accounts", icon: "bank" },
    { id: "import", label: "Import files", icon: "upload" },
    { id: "pay", label: "When you’re paid", icon: "calendar" },
    { id: "passkeys", label: "Your passkeys", icon: "passkey" },
    {
      id: "install",
      label: HOME_SCREEN.title,
      icon: HOME_SCREEN.icon,
      className: FEATURES.notifications ? undefined : "not-installed",
    },
  ];

  return (
    <>
      <PageHeader
        title="Accounts and sharing"
        back={{ href: "/", label: "home" }}
        actions={
          <>
            <Pill tone="quiet" icon="eye">
              Read-only, never moves money
            </Pill>
            <Tag>{shell.householdName}</Tag>
          </>
        }
      />

      <div className={styles.layout}>
        <nav aria-label="Settings sections" className={styles.sections}>
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={cx(styles.section, section.className)}
            >
              <Icon name={section.icon} size="sm" />
              <span>{section.label}</span>
            </a>
          ))}
        </nav>

        <div className={styles.content}>
          <div className={styles.member}>
            <Avatar
              owner={shell.member.owner}
              initials={shell.member.initials}
              label={shell.member.name}
              size="lg"
            />
            <div className="grow">
              <p className={styles.memberName}>{shell.member.name}</p>
              <p className="muted small">
                {roleLine(me.member.role, signInWords(h.get("user-agent")))}
              </p>
            </div>
            <Tag>{shell.householdName}</Tag>
          </div>

          <LiveSyncCard id="sync" />

          <Card as="section" id="accounts" aria-labelledby="accounts-title" className={styles.card}>
            <div className={styles.cardHead}>
              <h2 id="accounts-title" className="h2">
                Your accounts
              </h2>
              {accounts.length > 0 && (
                <span className="muted small">Only you can see them for now</span>
              )}
            </div>
            {accounts.length > 0 ? (
              <AccountsList accounts={accounts} />
            ) : (
              <EmptyState
                icon="bank"
                title="No accounts yet"
                action={
                  <>
                    <ButtonLink href="/import" icon="upload" variant="primary">
                      Import a bank file
                    </ButtonLink>
                    <ButtonLink href="/connect" icon="sync">
                      Connect live sync
                    </ButtonLink>
                  </>
                }
              >
                Import a file from your bank, or connect live sync, to add your first account. The
                app only reads your balances and transactions. It never moves money.
              </EmptyState>
            )}
          </Card>

          <section id="import" aria-labelledby="import-title" className={styles.importCard}>
            <div className={styles.cardHead}>
              <h2 id="import-title" className="h2">
                Import files
              </h2>
              <Pill tone="good" icon="check">
                Free, always works
              </Pill>
            </div>
            <Link href="/import" className={styles.drop}>
              <Icon name="upload" size="lg" className={styles.dropIcon} />
              <span className={styles.dropTitle}>Import a CSV, OFX or QIF file</span>
              <span className={cx("muted small", styles.dropText)}>
                {last ? (
                  <>
                    <span className={styles.phoneOnly}>Last import: {last}</span>
                    <span className={styles.wideOnly}>
                      From any bank. Works with or without live sync.
                    </span>
                  </>
                ) : (
                  "From any bank. Works with or without live sync."
                )}
              </span>
              <span className={cx(styles.fauxButton, styles.wideOnly)} aria-hidden="true">
                Choose a file
              </span>
            </Link>
            {last && (
              <p className={cx("small sub", styles.lastImport, styles.wideOnly)}>
                <Icon name="file" size="sm" className={styles.quiet} />
                <span>Last import: {last}</span>
              </p>
            )}
          </section>

          {/* Phone: the rest as rows. */}
          <Card
            as="section"
            aria-label="More settings"
            className={cx(styles.more, styles.phoneOnly)}
          >
            <ul className={styles.moreRows}>
              <ListRow
                as="li"
                leading={<Tile icon="tag" size="sm" />}
                title="Categories and rules"
                detail={categoriesLine(sorting.categories, sorting.rules)}
                trailing={<Icon name="chevron-right" size="sm" className={styles.quiet} />}
                href="/categories"
              />
              <ListRow
                as="li"
                leading={<Tile icon="calendar" size="sm" />}
                title="When you’re paid"
                detail={payLine}
                trailing={<Icon name="chevron-right" size="sm" className={styles.quiet} />}
                href="/paydays"
              />
              <ListRow
                as="li"
                leading={<Tile icon={HOME_SCREEN.icon} size="sm" />}
                title={HOME_SCREEN.title}
                detail="Opens like an app, with no app store"
                trailing={<Icon name="chevron-right" size="sm" className={styles.quiet} />}
                href="/install"
                className={FEATURES.notifications ? undefined : "not-installed"}
              />
              <ListRow
                as="li"
                leading={<Tile icon="passkey" size="sm" />}
                title="Your passkeys"
                detail={keysLine}
                trailing={<Icon name="chevron-right" size="sm" className={styles.quiet} />}
                href="/accounts/passkeys"
              />
            </ul>
          </Card>
          <div className={cx(styles.signOut, styles.phoneOnly)}>
            <SignOutButton />
          </div>

          {/* Desktop: the rest as sections. */}
          <Card
            as="section"
            id="pay"
            aria-labelledby="pay-title"
            className={cx(styles.card, styles.padded, styles.wideOnly)}
          >
            <div className={styles.spread}>
              <div>
                <h2 id="pay-title" className="h2">
                  When you&apos;re paid
                </h2>
                <p className={cx("sub small", styles.text)}>{payLine}</p>
              </div>
              <ButtonLink href="/paydays" icon="calendar">
                {pay ? "Change" : "Set your payday"}
              </ButtonLink>
            </div>
          </Card>
          <Card
            as="section"
            id="passkeys"
            aria-labelledby="passkeys-title"
            className={cx(styles.card, styles.padded, styles.wideOnly)}
          >
            <div>
              <h2 id="passkeys-title" className="h2">
                Your passkeys
              </h2>
              <p className={cx("sub small", styles.text)}>
                Add one on each phone or computer you use, so any of them can sign in with Face ID,
                a fingerprint or a screen lock.
              </p>
            </div>
            <Passkeys keys={keys} />
          </Card>
          <Card
            as="section"
            id="install"
            aria-label={HOME_SCREEN.title}
            className={cx(
              styles.installCard,
              styles.wideOnly,
              FEATURES.notifications ? undefined : "not-installed",
            )}
          >
            <ListRow
              leading={<Tile icon="install-desktop" />}
              title={HOME_SCREEN.title}
              detail="Opens like an app, with no app store"
              trailing={<Icon name="chevron-right" size="sm" className={styles.quiet} />}
              href="/install"
            />
          </Card>
        </div>
      </div>
    </>
  );
}
