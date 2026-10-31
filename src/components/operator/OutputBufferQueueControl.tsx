"use client";

import { DashboardIcon } from "@/components/operator/DashboardIcon";
import { BorderGlow } from "@/components/reactbits";
import { useT } from "@/i18n/provider";
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
 * an operator override of queued caption content, grouped under Caption controls. */
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
  const t = useT();
  const front = queue.entries[0] ?? null;
  const atCapacity = queue.entries.length >= OUTPUT_BUFFER_BACKING_CAPACITY;
  const frontHeld = front ? isOutputBufferEntryPaused(front) : false;
  const frontStatus = !front
    ? ""
    : front.pausedForEdit
      ? t("outputBuffer.pausedForEdit")
      : front.manuallyPaused
        ? t("outputBuffer.paused")
        : "";

  return (
    <div className="outputBufferQueue" aria-label={t("outputBuffer.queueLabel")}>
      <div className="outputBufferQueueHeader">
        <span>
          {t("outputBuffer.queueHeader", {
            state: front ? t("outputBuffer.nextUp") : t("outputBuffer.nothingWaiting"),
            count: queue.entries.length,
            capacity: OUTPUT_BUFFER_BACKING_CAPACITY,
          })}
        </span>
      </div>
      {atCapacity && frontHeld ? (
        <p className="privacyNote" role="alert">
          {t("outputBuffer.full")}
        </p>
      ) : null}
      {!front ? (
        <p className="previewEmpty">{t("outputBuffer.empty")}</p>
      ) : (
        <BorderGlow className="outputBufferSlotGlow" pending={frontHeld}>
          <article className="outputBufferSlot" aria-label={t("outputBuffer.nextQueuedLabel")}>
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
                    className="secondaryButton"
                    title={t("outputBuffer.cancelEdit")}
                    aria-label={t("outputBuffer.cancelEdit")}
                    disabled={disabled}
                    onClick={() => onCancelEdit(front.id)}
                  >
                    <DashboardIcon name="close" />
                  </button>
                  <button
                    type="button"
                    className="primaryButton"
                    title={t("outputBuffer.submitEdit")}
                    aria-label={t("outputBuffer.submitEdit")}
                    disabled={disabled}
                    onClick={() => onSubmitEdit(front.id)}
                  >
                    <DashboardIcon name="check" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="outputBufferSlotText">{front.publicText || t("outputBuffer.hidden")}</p>
                <div className="outputBufferSlotActions">
                  <button
                    type="button"
                    className="secondaryButton"
                    title={front.manuallyPaused ? t("outputBuffer.resume") : t("outputBuffer.pause")}
                    aria-label={front.manuallyPaused ? t("outputBuffer.resumeQueued") : t("outputBuffer.pauseQueued")}
                    disabled={disabled}
                    onClick={() => onPause(front.id, !front.manuallyPaused)}
                  >
                    <DashboardIcon name={front.manuallyPaused ? "play" : "pause"} />
                  </button>
                  <button
                    type="button"
                    className="secondaryButton"
                    title={t("outputBuffer.edit")}
                    aria-label={t("outputBuffer.editQueued")}
                    disabled={disabled}
                    onClick={() => onBeginEdit(front.id)}
                  >
                    <DashboardIcon name="edit" />
                  </button>
                  <button
                    type="button"
                    className="secondaryButton"
                    title={t("outputBuffer.showNow")}
                    aria-label={t("outputBuffer.fastForwardQueued")}
                    disabled={disabled}
                    onClick={() => onFastForward(front.id)}
                  >
                    <DashboardIcon name="fastForward" />
                  </button>
                  <button
                    type="button"
                    className="dangerOutlineButton"
                    title={t("outputBuffer.clear")}
                    aria-label={t("outputBuffer.clearQueued")}
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
