"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./BottomSheet.module.css";
import { IconButton } from "./Button";

type BottomSheetProps = {
  open: boolean;
  /** Called when the person closes it: the close button, the Escape key or a tap outside. */
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Usually the main button, kept in view below the scrolling content. */
  footer?: ReactNode;
  /** Something for the right of the title, such as a Reset button. */
  action?: ReactNode;
};

/**
 * A panel that slides up from the bottom. It's a real modal dialog, so focus stays inside it and
 * the page behind can't be reached until it closes.
 */
export function BottomSheet({ open, onClose, title, children, footer, action }: BottomSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={styles.sheet}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // The contents fill the dialog, so a click on the dialog itself is a tap on the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.inner}>
        <div className={styles.grabber} aria-hidden="true" />
        <div className={styles.header}>
          <IconButton icon="close" label="Close" onClick={onClose} />
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <span>{action}</span>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </dialog>
  );
}
