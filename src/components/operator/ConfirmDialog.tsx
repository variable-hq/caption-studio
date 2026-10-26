"use client";

import { useId, type RefObject } from "react";

interface ConfirmDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  body: string;
  cancelLabel: string;
  actionLabel: string;
  disabled: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

/** Confirms a destructive or irreversible action, opened imperatively via `dialogRef`.
 * Escape and the safe button both cancel; the action button sits on the right. */
export function ConfirmDialog({
  dialogRef,
  title,
  body,
  cancelLabel,
  actionLabel,
  disabled,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  return (
    <dialog
      ref={dialogRef}
      className="confirmationDialog"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={onCancel}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={bodyId}>{body}</p>
      <div className="confirmationRow">
        <button
          className="secondaryButton"
          type="button"
          autoFocus
          onClick={() => {
            dialogRef.current?.close();
            onCancel?.();
          }}
        >
          {cancelLabel}
        </button>
        <button
          className="dangerButton"
          type="button"
          disabled={disabled}
          onClick={() => {
            dialogRef.current?.close();
            onConfirm();
          }}
        >
          {actionLabel}
        </button>
      </div>
    </dialog>
  );
}
