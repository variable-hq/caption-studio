"use client";

import type { RefObject } from "react";

interface EndServiceDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  disabled: boolean;
  onConfirmEnd: () => void;
}

/** Confirmation gate for ending a live service, opened imperatively via `dialogRef`. */
export function EndServiceDialog({ dialogRef, disabled, onConfirmEnd }: EndServiceDialogProps) {
  return (
    <dialog
      ref={dialogRef}
      className="confirmationDialog"
      aria-labelledby="end-dialog-heading"
      aria-describedby="end-dialog-description"
    >
      <h2 id="end-dialog-heading">End captions for everyone?</h2>
      <p id="end-dialog-description">
        This stops microphone capture, clears OBS and the mobile viewer, and expires the
        mobile link. The reusable OBS URL stays available for the next service.
      </p>
      <div className="confirmationRow">
        <button className="secondaryButton" type="button" autoFocus onClick={() => dialogRef.current?.close()}>
          Keep service open
        </button>
        <button
          className="dangerButton"
          type="button"
          disabled={disabled}
          onClick={() => {
            dialogRef.current?.close();
            onConfirmEnd();
          }}
        >
          Confirm End
        </button>
      </div>
    </dialog>
  );
}
