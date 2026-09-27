"use client";

import { useId } from "react";

import { DashboardIcon } from "@/components/operator/DashboardNavigation";
import { BorderGlow } from "@/components/reactbits";
import {
  MAX_OUTPUT_BUFFER_DELAY_MS,
  OUTPUT_BUFFER_COUNT_OPTIONS,
  OUTPUT_BUFFER_DELAY_OPTIONS,
  isOutputBufferEntryPaused,
  normalizeOutputBufferCount,
  normalizeOutputBufferDelay,
  type OutputBufferCount,
  type OutputBufferDelayMs,
  type OutputBufferQueueState,
  type OutputBufferReviewState,
} from "@/live/output-buffer";
import { MAX_MANUAL_CAPTION_CHARS } from "@/live/contracts";

const COUNT_LABELS: Record<OutputBufferCount, string> = {
  0: "None",
  1: "1 slot",
  2: "2 slots",
};

const DELAY_LABELS: Record<OutputBufferDelayMs, string> = {
  auto: "Auto",
  2000: "2 sec",
  4000: "4 sec",
  6000: "6 sec",
};

interface OutputBufferPanelProps {
  count: OutputBufferCount;
  delay: OutputBufferDelayMs;
  onCountChange: (value: OutputBufferCount) => void;
  onDelayChange: (value: OutputBufferDelayMs) => void;
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
  delay,
  onCountChange,
  onDelayChange,
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

  return (
    <div className="outputBufferPanel">
      <div className="fieldGrid">
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
        {count > 0 ? (
          <label>
            Output buffer delay
            <select
              name="outputBufferDelay"
              autoComplete="off"
              data-testid="output-buffer-delay"
              value={delay}
              disabled={disabled}
              onChange={(event) => onDelayChange(normalizeOutputBufferDelay(event.target.value))}
            >
              {OUTPUT_BUFFER_DELAY_OPTIONS.map((value) => (
                <option value={value} key={value}>
                  {DELAY_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <p className="helpText" id={countHelpId}>
        None shows each translation live immediately, with no delay. A buffer holds new
        translations for a moment first, giving you time to pause, correct, or drop one
        before it reaches OBS and the mobile viewer; the delay caps out at{" "}
        {MAX_OUTPUT_BUFFER_DELAY_MS / 1_000} seconds. Auto paces itself and only holds a
        caption longer when it would otherwise overtake the one ahead of it.
      </p>
      {count > 0 ? (
        <div className="outputBufferQueue" aria-label="Output buffer queue">
          <div className="outputBufferQueueHeader">
            <span>{queue.entries.length ? `${queue.entries.length} queued` : "Buffer empty"}</span>
            <button
              type="button"
              className="secondaryButton compactButton"
              title="Beta: let AI review the queued captions for continuity with the current live caption"
              aria-label="Beta: review buffer for continuity"
              disabled={disabled || review.busy || queue.entries.length === 0}
              onClick={onRequestReview}
            >
              <DashboardIcon name="wand" /> Beta review
            </button>
          </div>
          {review.message ? (
            <p className="helpText" role="status">
              {review.message}
            </p>
          ) : null}
          {queue.entries.length === 0 ? (
            <p className="previewEmpty">Nothing queued. New translations will land here first.</p>
          ) : (
            <ol className="outputBufferSlots">
              {queue.entries.map((entry, index) => {
                const paused = isOutputBufferEntryPaused(entry);
                return (
                  <li key={entry.id}>
                    <BorderGlow className="outputBufferSlotGlow" pending={paused}>
                      <article className="outputBufferSlot" aria-label={`Queue position ${index + 1}`}>
                        <div className="outputBufferSlotHeader">
                          <span className="eyebrow">{index === 0 ? "Next up" : `Queued #${index + 1}`}</span>
                          <span className="outputBufferSlotStatus">
                            {entry.pausedForReview
                              ? "Reviewing…"
                              : entry.pausedForEdit
                                ? "Paused for edit"
                                : entry.manuallyPaused
                                  ? "Paused"
                                  : entry.revisedByModel
                                    ? "Revised"
                                    : ""}
                          </span>
                        </div>
                        {entry.editing ? (
                          <>
                            <textarea
                              name="outputBufferEditDraft"
                              autoComplete="off"
                              rows={2}
                              maxLength={MAX_MANUAL_CAPTION_CHARS}
                              value={entry.editedDraft ?? ""}
                              onChange={(event) => onEditDraftChange(entry.id, event.target.value)}
                            />
                            <div className="outputBufferSlotActions">
                              <button
                                type="button"
                                className="secondaryButton compactButton"
                                title="Cancel edit"
                                aria-label="Cancel edit"
                                onClick={() => onCancelEdit(entry.id)}
                              >
                                <DashboardIcon name="close" />
                              </button>
                              <button
                                type="button"
                                className="primaryButton compactButton"
                                title="Submit edit"
                                aria-label="Submit edit"
                                onClick={() => onSubmitEdit(entry.id)}
                              >
                                <DashboardIcon name="check" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="outputBufferSlotText">{entry.publicText || "(hidden by a public filter)"}</p>
                            <div className="outputBufferSlotActions">
                              <button
                                type="button"
                                className="secondaryButton compactButton"
                                title={entry.manuallyPaused ? "Resume" : "Pause"}
                                aria-label={entry.manuallyPaused ? "Resume this queued caption" : "Pause this queued caption"}
                                disabled={disabled}
                                onClick={() => onPause(entry.id, !entry.manuallyPaused)}
                              >
                                <DashboardIcon name={entry.manuallyPaused ? "play" : "pause"} />
                              </button>
                              <button
                                type="button"
                                className="secondaryButton compactButton"
                                title="Edit"
                                aria-label="Edit this queued caption"
                                disabled={disabled}
                                onClick={() => onBeginEdit(entry.id)}
                              >
                                <DashboardIcon name="edit" />
                              </button>
                              <button
                                type="button"
                                className="secondaryButton compactButton"
                                title="Fast-forward to Live"
                                aria-label="Fast-forward this queued caption to Live"
                                disabled={disabled}
                                onClick={() => onFastForward(entry.id)}
                              >
                                <DashboardIcon name="fastForward" />
                              </button>
                              <button
                                type="button"
                                className="dangerButton compactButton"
                                title="Clear"
                                aria-label="Clear this queued caption"
                                disabled={disabled}
                                onClick={() => onClear(entry.id)}
                              >
                                <DashboardIcon name="trash" />
                              </button>
                            </div>
                          </>
                        )}
                      </article>
                    </BorderGlow>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}
