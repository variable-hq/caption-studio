"use client";

import { useId } from "react";

import {
  OUTPUT_BUFFER_COUNT_OPTIONS,
  OUTPUT_BUFFER_DWELL_MS,
  normalizeOutputBufferCount,
  type OutputBufferCount,
} from "@/live/output-buffer";

function countLabel(value: OutputBufferCount, isDefault: boolean): string {
  const label = value === 0 ? "Off" : `On (${OUTPUT_BUFFER_DWELL_MS / 1_000}s delay)`;
  return isDefault ? `${label} · Your default` : label;
}

interface OutputBufferPanelProps {
  count: OutputBufferCount;
  onCountChange: (value: OutputBufferCount) => void;
  onSaveDefault: () => void;
  savedMessage: string;
  disabled?: boolean;
  defaultCount?: OutputBufferCount | null;
}

/** The output buffer's On/Off setting and its account default — configuration, not a
 * live control. See OutputBufferQueueControl for the operator-facing queue itself,
 * grouped under Manual overrides since it's an override, not connectivity config. */
export function OutputBufferPanel({
  count,
  onCountChange,
  onSaveDefault,
  savedMessage,
  disabled = false,
  defaultCount = null,
}: OutputBufferPanelProps) {
  const countHelpId = useId();

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
        caption for {OUTPUT_BUFFER_DWELL_MS / 1_000} seconds so you can pause, correct, or
        drop it before it reaches OBS and the mobile viewer. If you leave one paused or
        being edited while more speech comes in, captions keep queuing up behind it out of
        sight; once that backlog is full, any further caption is dropped rather than shown
        or queued. Use Manual overrides in Service controls to act on the queued caption.
      </p>
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
