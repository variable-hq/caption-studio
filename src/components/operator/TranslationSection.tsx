"use client";

import type { ReactNode } from "react";

interface TranslationSectionProps {
  translationSettingsEditor: ReactNode;
  onSaveDefaults: () => void;
  disabled: boolean;
  savedDefaultMessage: string;
  transcriptionModel: string;
  translationModel: string;
}

/** The "translation" workspace section: the settings editor, its saved-default action, and
 * the collapsed model/timing details strip. */
export function TranslationSection({
  translationSettingsEditor,
  onSaveDefaults,
  disabled,
  savedDefaultMessage,
  transcriptionModel,
  translationModel,
}: TranslationSectionProps) {
  return (
    <div className="panelStack">
      {translationSettingsEditor}
      <div className="saveRow">
        <button className="secondaryButton" type="button" onClick={onSaveDefaults} disabled={disabled}>
          Save as my default setup
        </button>
        <p role="status" aria-live="polite" aria-atomic="true">
          {savedDefaultMessage}
        </p>
      </div>
      <details className="modelSummary serviceDetailStrip advancedActions">
        <summary>Service details</summary>
        <p>
          <strong>Transcription:</strong> <code>{transcriptionModel}</code>
        </p>
        <p>
          <strong>Translation:</strong> <code>{translationModel}</code>
        </p>
        <p>
          <strong>Caption timing:</strong> The selected recording window plus queue wait,
          cloud processing, and audience delivery delay.
        </p>
      </details>
    </div>
  );
}
