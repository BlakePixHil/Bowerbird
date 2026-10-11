import { ButtonLink, Icon, WarningBanner } from "@/components/ui";
import { syncWarning } from "@/lib/banks/live/banks";
import { getLiveHealth, getShell } from "./data";
import { SyncNowButton } from "./SyncNowButton";

/**
 * The calm warning at the top of Home and Activity when live sync needs the viewer: reconnect a
 * bank, renew a consent that's about to run out, or try a sync that failed. Nothing when all is
 * well, or when live sync isn't connected.
 */
export async function SyncWarningBanner() {
  const shell = await getShell();
  if (shell.live.connections === 0) return null;
  const warning = syncWarning(await getLiveHealth(), shell.today, shell.timeZone);
  if (!warning) return null;
  const { action } = warning;
  return (
    <WarningBanner
      title={warning.title}
      action={
        action.kind === "sync" ? (
          <SyncNowButton />
        ) : action.external ? (
          <ButtonLink
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${action.label} (opens in a new tab)`}
          >
            <span>{action.label}</span>
            <Icon name="external" size="sm" />
          </ButtonLink>
        ) : (
          <ButtonLink href={action.href}>{action.label}</ButtonLink>
        )
      }
    >
      {warning.body}
    </WarningBanner>
  );
}
