"use client";

import { DashboardIcon } from "@/components/operator/DashboardIcon";
import { BorderGlow } from "@/components/reactbits";
import {
  OUTPUT_BUFFER_BACKING_CAPACITY,
  isOutputBufferEntryPaused,
  type OutputBufferQueueState,
} from "@/live/output-buffer";
import { MAX_MANUAL_CAPTION_CHARS } from "@/live/contracts";

interface OutputBufferQueueControlProps {
  queue: OutputBufferQueueState;
  disabled?: boolean;
  onPause: (id: string, paused: boolean) => void;
  onClear: (id: string) => void;
  onFastForward: (id: string) => void;
  onBeginEdit: (id: string) => void;
  onEditDraftChange: (id: string, text: string) => void;
  onCancelEdit: (id: string) => void;
  onSubmitEdit: (id: string) => void;
}

/** The output buffer's next-up caption and its Pause/Edit/Fast-forward/Clear controls —
 * an operator override of queued caption content, grouped under Manual overrides. */
export function OutputBufferQueueControl({
  queue,
  disabled = false,
  onPause,
  onClear,
  onFastForward,
  onBeginEdit,
  onEditDraftChange,
  onCancelEdit,
  onSubmitEdit,
}: OutputBufferQueueControlProps) {
  const front = queue.entries[0] ?? null;
  const atCapacity = queue.entries.length >= OUTPUT_BUFFER_BACKING_CAPACITY;
  const frontHeld = front ? isOutputBufferEntryPaused(front) : false;
  const frontStatus = !front
    ? ""
    : front.pausedForEdit
      ? "Paused for edit"
      : front.manuallyPaused
        ? "Paused"
        : "";

  return (
    <div className="outputBufferQueue" aria-label="Output buffer">
      <div className="outputBufferQueueHeader">
        <span>
          {!front ? "Nothing waiting" : "Next up"} · {queue.entries.length}/{OUTPUT_BUFFER_BACKING_CAPACITY} queued
        </span>
      </div>
      {atCapacity && frontHeld ? (
        <p className="privacyNote" role="alert">
          Buffer full — further captions will be dropped until you resume, submit, or
          clear this one.
        </p>
      ) : null}
      {!front ? (
        <p className="previewEmpty">Nothing queued. New translations will land here first.</p>
      ) : (
        <BorderGlow className="outputBufferSlotGlow" pending={frontHeld}>
          <article className="outputBufferSlot" aria-label="Next queued caption">
            {frontStatus ? (
              <div className="outputBufferSlotHeader">
                <span className="outputBufferSlotStatus">{frontStatus}</span>
              </div>
            ) : null}
            {front.editing ? (
              <>
                <textarea
                  name="outputBufferEditDraft"
                  autoComplete="off"
                  rows={2}
                  maxLength={MAX_MANUAL_CAPTION_CHARS}
                  value={front.editedDraft ?? ""}
                  disabled={disabled}
                  onChange={(event) => onEditDraftChange(front.id, event.target.value)}
                />
                <div className="outputBufferSlotActions">
                  <button
                    type="button"
                    className="secondaryButton compactButton"
                    title="Cancel edit"
                    aria-label="Cancel edit"
                    disabled={disabled}
                    onClick={() => onCancelEdit(front.id)}
                  >
                    <DashboardIcon name="close" />
                  </button>
                  <button
                    type="button"
                    className="primaryButton compactButton"
                    title="Submit edit"
                    aria-label="Submit edit"
                    disabled={disabled}
                    onClick={() => onSubmitEdit(front.id)}
                  >
                    <DashboardIcon name="check" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="outputBufferSlotText">{front.publicText || "(hidden by a public filter)"}</p>
                <div className="outputBufferSlotActions">
                  <button
                    type="button"
                    className="secondaryButton compactButton"
                    title={front.manuallyPaused ? "Resume" : "Pause"}
                    aria-label={front.manuallyPaused ? "Resume this queued caption" : "Pause this queued caption"}
                    disabled={disabled}
                    onClick={() => onPause(front.id, !front.manuallyPaused)}
                  >
                    <DashboardIcon name={front.manuallyPaused ? "play" : "pause"} />
                  </button>
                  <button
                    type="button"
                    className="secondaryButton compactButton"
                    title="Edit"
                    aria-label="Edit this queued caption"
                    disabled={disabled}
                    onClick={() => onBeginEdit(front.id)}
                  >
                    <DashboardIcon name="edit" />
                  </button>
                  <button
                    type="button"
                    className="secondaryButton compactButton"
                    title="Show now"
                    aria-label="Fast-forward this queued caption to Live"
                    disabled={disabled}
                    onClick={() => onFastForward(front.id)}
                  >
                    <DashboardIcon name="fastForward" />
                  </button>
                  <button
                    type="button"
                    className="dangerButton compactButton"
                    title="Clear"
                    aria-label="Clear this queued caption"
                    disabled={disabled}
                    onClick={() => onClear(front.id)}
                  >
                    <DashboardIcon name="trash" />
                  </button>
                </div>
              </>
            )}
          </article>
        </BorderGlow>
      )}
    </div>
  );
}
