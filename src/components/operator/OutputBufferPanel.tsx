"use client";

import { useId } from "react";

import {
  OUTPUT_BUFFER_COUNT_OPTIONS,
  OUTPUT_BUFFER_DWELL_OPTIONS_MS,
  normalizeOutputBufferCount,
  normalizeOutputBufferDwellMs,
  type OutputBufferCount,
  type OutputBufferDwellMs,
} from "@/live/output-buffer";

function countLabel(value: OutputBufferCount, isDefault: boolean): string {
  const label = value === 0 ? "Off" : "On";
  return isDefault ? `${label} · Your default` : label;
}

function dwellLabel(value: OutputBufferDwellMs, isDefault: boolean): string {
  const seconds = value / 1_000;
  const label = `${seconds} second${seconds === 1 ? "" : "s"}`;
  return isDefault ? `${label} · Your default` : label;
}

interface OutputBufferPanelProps {
  count: OutputBufferCount;
  onCountChange: (value: OutputBufferCount) => void;
  dwellMs: OutputBufferDwellMs;
  onDwellChange: (value: OutputBufferDwellMs) => void;
  onSaveDefault: () => void;
  savedMessage: string;
  disabled?: boolean;
  defaultCount?: OutputBufferCount | null;
  defaultDwellMs?: OutputBufferDwellMs | null;
}

/** The output buffer's On/Off setting, dwell duration, and account default —
 * configuration, not a live control. See OutputBufferQueueControl for the
 * operator-facing queue itself, grouped under Manual overrides since it's an
 * override, not connectivity config. */
export function OutputBufferPanel({
  count,
  onCountChange,
  dwellMs,
  onDwellChange,
  onSaveDefault,
  savedMessage,
  disabled = false,
  defaultCount = null,
  defaultDwellMs = null,
}: OutputBufferPanelProps) {
  const countHelpId = useId();
  const dwellHelpId = useId();

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
              {countLabel(value, defaultCount === value)}
            </option>
          ))}
        </select>
      </label>
      <p className="helpText" id={countHelpId}>
        Off shows each translation live immediately, with no delay. On holds the next
        caption so you can pause, correct, or drop it before it reaches OBS and the mobile
        viewer. If you leave one paused or being edited while more speech comes in,
        captions keep queuing up behind it out of sight; once that backlog is full, any
        further caption is dropped rather than shown or queued. Use Manual overrides in
        Service controls to act on the queued caption.
      </p>
      {count > 0 ? (
        <>
          <label>
            Dwell duration
            <select
              name="outputBufferDwellMs"
              autoComplete="off"
              data-testid="output-buffer-dwell"
              value={dwellMs}
              disabled={disabled}
              aria-describedby={dwellHelpId}
              onChange={(event) => onDwellChange(normalizeOutputBufferDwellMs(event.target.value))}
            >
              {OUTPUT_BUFFER_DWELL_OPTIONS_MS.map((value) => (
                <option value={value} key={value}>
                  {dwellLabel(value, defaultDwellMs === value)}
                </option>
              ))}
            </select>
          </label>
          <p className="helpText" id={dwellHelpId}>
            How long the next-up caption holds before advancing to Live.
          </p>
        </>
      ) : null}
      <div className="saveRow">
        <button className="secondaryButton" type="button" onClick={onSaveDefault} disabled={disabled}>
          Save as my default
        </button>
        <p role="status" aria-live="polite" aria-atomic="true">
          {savedMessage}
        </p>
      </div>
    </div>
  );
}
