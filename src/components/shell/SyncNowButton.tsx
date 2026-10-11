"use client";

import { useTransition } from "react";
import { useOnline } from "@/components/offline/online";
import { Button, cx, IconButton } from "@/components/ui";
import { syncNow } from "./actions";
import styles from "./Shell.module.css";

/**
 * Sync now: a button with words on desktop, or just the icon in the phone's header. It waits
 * while there's no signal.
 */
export function SyncNowButton({ compact = false }: { compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  const online = useOnline();
  const label = pending ? "Syncing…" : "Sync now";
  const look = {
    onClick: () => startTransition(() => syncNow().catch(() => {})),
    disabled: !online,
    "aria-busy": pending || undefined,
    className: cx(pending && styles.spinning),
  };
  if (compact) return <IconButton icon="sync" label={label} {...look} />;
  return (
    <Button icon="sync" {...look}>
      {label}
    </Button>
  );
}
