import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, ButtonLink, cx, Icon, IconButtonLink, LogoMark } from "@/components/ui";
import { formatShortDate } from "@/lib/money";
import { getShell } from "./data";
import styles from "./Shell.module.css";
import { syncLabel } from "./sync";
import { SyncNowButton } from "./SyncNowButton";

type Place = { href: string; label: string };

type PageHeaderProps = {
  title: string;
  /** Home: on a phone the household's name and Sync now take the title's place. */
  home?: boolean;
  /** Where the phone's back button goes, for pages opened from another page. */
  back?: Place;
  /** The page this one sits under, shown above the title on desktop instead of the date line. */
  parent?: Place;
  /** The small line above the title on desktop. Defaults to today's date and the sync time. */
  line?: string;
  /** Buttons on the right on desktop. Defaults to Import a file and Sync now; null shows none. */
  actions?: ReactNode;
  /** Icon buttons before the avatar in the phone's header. */
  phoneActions?: ReactNode;
  /** False when the page draws its own phone header, such as a flow with steps. */
  phone?: boolean;
  /** A line under the desktop title, saying what the page is for. */
  intro?: string;
};

/**
 * The top of every signed-in page, from the "Home" and "Desktop: Home" boards. A phone and a
 * desktop header are both drawn and CSS shows one, so only one title is ever read out.
 */
export async function PageHeader({
  title,
  home = false,
  back,
  parent,
  line,
  actions,
  phoneActions,
  phone = true,
  intro,
}: PageHeaderProps) {
  const shell = await getShell();
  const dateLine = `${formatShortDate(shell.today)} · ${syncLabel(shell.sync, shell.now, shell.timeZone)}`;
  const account = (
    <Link href="/accounts" aria-label="Accounts and sharing" className={styles.avatarLink}>
      <Avatar
        owner={shell.member.owner}
        initials={shell.member.initials}
        label={shell.member.name}
        size="lg"
      />
    </Link>
  );

  return (
    <header>
      {phone && (
        <div className={styles.phone}>
          <div className={cx(styles.phoneBar, back && styles.phoneBack)}>
            {home ? (
              <>
                <h1 className="sr-only">{title}</h1>
                <div className={styles.household}>
                  <LogoMark size={28} />
                  <span className={styles.phoneHousehold}>{shell.householdName}</span>
                </div>
                <div className={styles.tools}>
                  <SyncNowButton compact />
                  {account}
                </div>
              </>
            ) : back ? (
              <>
                <IconButtonLink
                  icon="arrow-left"
                  label={`Back to ${back.label}`}
                  href={back.href}
                />
                <h1 className={cx("h1", styles.subTitle)}>{title}</h1>
              </>
            ) : (
              <>
                <h1 className="h1">{title}</h1>
                <div className={styles.tools}>
                  {phoneActions}
                  {account}
                </div>
              </>
            )}
          </div>
          {home && <p className={cx("mono", styles.line)}>{dateLine}</p>}
        </div>
      )}

      <div className={styles.desktop}>
        <div className={styles.titles}>
          {parent ? (
            <nav aria-label="Breadcrumb" className={styles.crumb}>
              <Link href={parent.href}>{parent.label}</Link>
              <Icon name="chevron-right" size="sm" />
            </nav>
          ) : (
            <p className={cx("mono", styles.line)}>{line ?? dateLine}</p>
          )}
          <h1 className="h1">{title}</h1>
          {intro && <p className={cx("sub", styles.intro)}>{intro}</p>}
        </div>
        {actions !== null && (
          <div className={styles.actions}>
            {actions ?? (
              <>
                <ButtonLink href="/import" icon="upload">
                  Import a file
                </ButtonLink>
                <SyncNowButton />
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
