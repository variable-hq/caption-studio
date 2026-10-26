"use client";

import { useId, useState } from "react";

import { MAX_MANUAL_CAPTION_CHARS } from "@/live/contracts";

interface ManualCaptionControlProps {
  disabled?: boolean;
  busy?: boolean;
  onShow: (text: string) => void;
}

/**
 * Lets a paused operator show typed text (an announcement, a hymn line) to OBS and
 * viewers instead of the hidden live translation. Resume or Clear removes it.
 */
export function ManualCaptionControl({
  disabled = false,
  busy = false,
  onShow,
}: ManualCaptionControlProps) {
  const [text, setText] = useState("");
  const helpId = useId();

  return (
    <div className="manualCaptionControl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim()) return;
          onShow(text);
        }}
      >
        <label>
          Manual caption
          <input
            name="manualCaptionText"
            autoComplete="off"
            value={text}
            maxLength={MAX_MANUAL_CAPTION_CHARS}
            disabled={disabled}
            aria-describedby={helpId}
            placeholder="e.g. Please silence your phones…"
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <button
          className="secondaryButton compact"
          type="submit"
          disabled={disabled || busy || !text.trim()}
        >
          {busy ? "Showing…" : "Show now"}
        </button>
      </form>
      <p className="privacyNote" id={helpId}>
        Replaces the hidden paused caption in OBS and for viewers. Resume or Clear removes it.
      </p>
    </div>
  );
}
