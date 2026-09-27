"use client";

import { useId } from "react";

import { DashboardIcon } from "@/components/operator/DashboardNavigation";
import { BorderGlow } from "@/components/reactbits";
import {
  OUTPUT_BUFFER_BACKING_CAPACITY,
  OUTPUT_BUFFER_COUNT_OPTIONS,
  isOutputBufferEntryPaused,
  normalizeOutputBufferCount,
  type OutputBufferCount,
  type OutputBufferQueueState,
  type OutputBufferReviewState,
} from "@/live/output-buffer";
import { MAX_MANUAL_CAPTION_CHARS } from "@/live/contracts";

const COUNT_LABELS: Record<OutputBufferCount, string> = {
  0: "Off",
  1: "On",
};

interface OutputBufferPanelProps {
  count: OutputBufferCount;
  onCountChange: (value: OutputBufferCount) => void;
  onSaveDefault: () => void;
  savedMessage: string;
  queue: OutputBufferQueueState;
  disabled?: boolean;
  onPause: (id: string, paused: boolean) => void;
  onClear: (id: string) => void;
  onFastForward: (id: string) => void;
  onBeginEdit: (id: string) => void;
  onEditDraftChange: (id: string, text: string) => void;
  onCancelEdit: (id: string) => void;
  onSubmitEdit: (id: string) => void;
  review: OutputBufferReviewState;
  onRequestReview: () => void;
}

export function OutputBufferPanel({
  count,
  onCountChange,
  onSaveDefault,
  savedMessage,
  queue,
  disabled = false,
  onPause,
  onClear,
  onFastForward,
  onBeginEdit,
  onEditDraftChange,
  onCancelEdit,
  onSubmitEdit,
  review,
  onRequestReview,
}: OutputBufferPanelProps) {
  const countHelpId = useId();
  const front = queue.entries[0] ?? null;
  const atCapacity = queue.entries.length >= OUTPUT_BUFFER_BACKING_CAPACITY;
  const frontHeld = front ? isOutputBufferEntryPaused(front) : false;
  const frontActionsDisabled = disabled || review.busy;
  const frontStatus = !front
    ? ""
    : front.pausedForReview
      ? "Reviewing…"
      : front.pausedForEdit
        ? "Paused for edit"
        : front.manuallyPaused
          ? "Paused"
          : front.revisedByModel
            ? "Revised"
            : "";

  return (
    <div className="outputBufferPanel">
      <label>
        Output buffer
        <select
          name="outputBufferCount"
          autoComplete="off"
          data-testid="output-buffer-count"
          value={count}
          disabled={disabled}
          aria-describedby={countHelpId}
          onChange={(event) => onCountChange(normalizeOutputBufferCount(event.target.value))}
        >
          {OUTPUT_BUFFER_COUNT_OPTIONS.map((value) => (
            <option value={value} key={value}>
              {COUNT_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <p className="helpText" id={countHelpId}>
        Off shows each translation live immediately, with no delay. On holds the next
        caption briefly so you can pause, correct, or drop it before it reaches OBS and the
        mobile viewer. If you leave one paused or being edited while more speech comes in,
        captions keep queuing up behind it out of sight; once that backlog is full, any
        further caption is dropped rather than shown or queued.
      </p>
      <div className="saveRow">
        <button className="secondaryButton" type="button" onClick={onSaveDefault} disabled={disabled}>
          Save as my default
        </button>
        <p role="status" aria-live="polite" aria-atomic="true">
          {savedMessage}
        </p>
      </div>
      {count > 0 ? (
        <div className="outputBufferQueue" aria-label="Output buffer">
          <div className="outputBufferQueueHeader">
            <span>
              {!front ? "Buffer empty" : "Next up"} · {queue.entries.length}/{OUTPUT_BUFFER_BACKING_CAPACITY} queued
            </span>
            <button
              type="button"
              className="secondaryButton compactButton"
              title="Beta: let AI review everything currently queued, including captions not shown here yet, for continuity with the current live caption"
              aria-label="Beta: review buffer for continuity"
              disabled={disabled || review.busy || queue.entries.length === 0}
              onClick={onRequestReview}
            >
              <DashboardIcon name="wand" /> Beta review
            </button>
          </div>
          {atCapacity && frontHeld ? (
            <p className="privacyNote" role="alert">
              Buffer full — further captions will be dropped until you resume, submit, or
              clear this one.
            </p>
          ) : null}
          {review.message ? (
            <p className="helpText" role="status">
              {review.message}
            </p>
          ) : null}
          {!front ? (
            <p className="previewEmpty">Nothing queued. New translations will land here first.</p>
          ) : (
            <BorderGlow className="outputBufferSlotGlow" pending={isOutputBufferEntryPaused(front)}>
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
                      onChange={(event) => onEditDraftChange(front.id, event.target.value)}
                    />
                    <div className="outputBufferSlotActions">
                      <button
                        type="button"
                        className="secondaryButton compactButton"
                        title="Cancel edit"
                        aria-label="Cancel edit"
                        onClick={() => onCancelEdit(front.id)}
                      >
                        <DashboardIcon name="close" />
                      </button>
                      <button
                        type="button"
                        className="primaryButton compactButton"
                        title="Submit edit"
                        aria-label="Submit edit"
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
                        disabled={frontActionsDisabled}
                        onClick={() => onPause(front.id, !front.manuallyPaused)}
                      >
                        <DashboardIcon name={front.manuallyPaused ? "play" : "pause"} />
                      </button>
                      <button
                        type="button"
                        className="secondaryButton compactButton"
                        title="Edit"
                        aria-label="Edit this queued caption"
                        disabled={frontActionsDisabled}
                        onClick={() => onBeginEdit(front.id)}
                      >
                        <DashboardIcon name="edit" />
                      </button>
                      <button
                        type="button"
                        className="secondaryButton compactButton"
                        title="Fast-forward to Live"
                        aria-label="Fast-forward this queued caption to Live"
                        disabled={frontActionsDisabled}
                        onClick={() => onFastForward(front.id)}
                      >
                        <DashboardIcon name="fastForward" />
                      </button>
                      <button
                        type="button"
                        className="dangerButton compactButton"
                        title="Clear"
                        aria-label="Clear this queued caption"
                        disabled={frontActionsDisabled}
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
      ) : null}
    </div>
  );
}
