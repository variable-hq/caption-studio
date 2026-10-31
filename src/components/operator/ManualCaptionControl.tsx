"use client";

import { useId, useState } from "react";

import { useT } from "@/i18n/provider";
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
  const t = useT();
  const [text, setText] = useState("");
  const helpId = useId();

  return (
    <div className="manualCaptionControl">
      <form
        className="inlineForm"
        onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim()) return;
          onShow(text);
        }}
      >
        <label>
          {t("manualCaption.label")}
          <input
            name="manualCaptionText"
            autoComplete="off"
            value={text}
            maxLength={MAX_MANUAL_CAPTION_CHARS}
            disabled={disabled}
            aria-describedby={helpId}
            placeholder={t("manualCaption.placeholder")}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <button
          className="secondaryButton"
          type="submit"
          disabled={disabled || busy || !text.trim()}
        >
          {busy ? t("common.showing") : t("manualCaption.showNow")}
        </button>
      </form>
      <p className="settingHint" id={helpId}>
        {t("manualCaption.hint")}
      </p>
    </div>
  );
}
