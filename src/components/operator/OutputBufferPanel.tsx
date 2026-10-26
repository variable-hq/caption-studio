"use client";

import { useId } from "react";

import {
  DEFAULT_OUTPUT_BUFFER_DWELL_MS,
  OUTPUT_BUFFER_DWELL_OPTIONS_MS,
  normalizeOutputBufferCount,
  normalizeOutputBufferDwellMs,
  type OutputBufferCount,
  type OutputBufferDwellMs,
} from "@/live/output-buffer";

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

/** "Check captions before they show": one choice, Off or how long each caption waits.
 * Stored as the existing count (0 or 1) and dwell, so saved setups keep their format. */
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
  const helpId = useId();
  const value = count > 0 ? String(dwellMs) : "off";
  const defaultValue = defaultCount === null ? null : defaultCount > 0 ? String(defaultDwellMs ?? DEFAULT_OUTPUT_BUFFER_DWELL_MS) : "off";
  const badge = (option: string) => (defaultValue === option ? " · Church default" : "");

  return (
    <div className="outputBufferPanel">
      <label>
        Wait before showing each caption
        <select
          name="outputBufferWait"
          autoComplete="off"
          data-testid="output-buffer-wait"
          value={value}
          disabled={disabled}
          aria-describedby={helpId}
          onChange={(event) => {
            if (event.target.value === "off") return onCountChange(0);
            onCountChange(normalizeOutputBufferCount(1));
            onDwellChange(normalizeOutputBufferDwellMs(event.target.value));
          }}
        >
          <option value="off">Off: show straight away{badge("off")}</option>
          {OUTPUT_BUFFER_DWELL_OPTIONS_MS.map((ms) => (
            <option value={ms} key={ms}>
              Wait {ms / 1000} {ms === 1000 ? "second" : "seconds"}{badge(String(ms))}
            </option>
          ))}
        </select>
      </label>
      <p className="helpText" id={helpId}>
        While a caption waits under Next up you can edit, pause or skip it. Changes apply
        straight away.
      </p>
      <div className="saveRow">
        <button className="secondaryButton" type="button" onClick={onSaveDefault} disabled={disabled}>
          Save for everyone
        </button>
        <p role="status" aria-live="polite" aria-atomic="true">
          {savedMessage}
        </p>
      </div>
    </div>
  );
}
