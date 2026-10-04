"use client";

import { useId } from "react";

import { ManualOverridesGroup } from "@/components/operator/ManualOverridesGroup";
import { OutputBufferPanel } from "@/components/operator/OutputBufferPanel";
import { MAX_FILTER_INPUT_CHARS } from "@/live/translation-settings";
import type { OutputBufferCount, OutputBufferDwellMs, OutputBufferQueueState } from "@/live/output-buffer";
import type { QuickBlockEntry } from "@/live/quick-block";

interface OutputBufferSectionProps {
  count: OutputBufferCount;
  onCountChange: (value: OutputBufferCount) => void;
  dwellMs: OutputBufferDwellMs;
  onDwellChange: (value: OutputBufferDwellMs) => void;
  onSaveDefault: () => void;
  savedMessage: string;
  defaultCount: OutputBufferCount | null;
  defaultDwellMs: OutputBufferDwellMs | null;
}

interface ManualOverridesProps {
  quickBlockEntries: readonly QuickBlockEntry[];
  onAddQuickBlock: (term: string) => void;
  onRemoveQuickBlock: (id: string) => void;
  isPaused: boolean;
  isBusy: boolean;
  controlBusy: boolean;
  manualCaptionBusy: boolean;
  onShowManualCaption: (text: string) => void;
  outputBufferCount: OutputBufferCount;
  outputBufferQueue: OutputBufferQueueState;
  onOutputBufferPause: (id: string, paused: boolean) => void;
  onOutputBufferClear: (id: string) => void;
  onOutputBufferFastForward: (id: string) => void;
  onOutputBufferBeginEdit: (id: string) => void;
  onOutputBufferEditDraftChange: (id: string, text: string) => void;
  onOutputBufferCancelEdit: (id: string) => void;
  onOutputBufferSubmitEdit: (id: string) => void;
}

interface ManualOverrideSectionProps {
  isBusy: boolean;
  outputBuffer: OutputBufferSectionProps;
  filterText: string;
  onFilterTextChange: (value: string) => void;
  filterDisabled: boolean;
  hasService: boolean;
  manualOverrides: ManualOverridesProps;
}

/** Every control that overrides or configures what reaches the audience: standing config
 * (output buffer, public filter) available before a service starts, plus the live-only
 * actions (Quick block, Manual caption, the output-buffer queue) once one has. */
export function ManualOverrideSection({
  isBusy,
  outputBuffer,
  filterText,
  onFilterTextChange,
  filterDisabled,
  hasService,
  manualOverrides,
}: ManualOverrideSectionProps) {
  const filterHelpId = useId();

  return (
    <div className="panelStack">
      <OutputBufferPanel
        count={outputBuffer.count}
        onCountChange={outputBuffer.onCountChange}
        dwellMs={outputBuffer.dwellMs}
        onDwellChange={outputBuffer.onDwellChange}
        onSaveDefault={outputBuffer.onSaveDefault}
        savedMessage={outputBuffer.savedMessage}
        disabled={isBusy}
        defaultCount={outputBuffer.defaultCount}
        defaultDwellMs={outputBuffer.defaultDwellMs}
      />
      <label>
        Public caption filter
        <input
          name="publicFilter"
          autoComplete="off"
          value={filterText}
          maxLength={MAX_FILTER_INPUT_CHARS}
          disabled={filterDisabled}
          aria-describedby={filterHelpId}
          onChange={(event) => onFilterTextChange(event.target.value)}
          placeholder="word, word=>replacement, word=>!hide…"
        />
      </label>
      <p className="privacyNote" id={filterHelpId}>
        Filtering changes only the public caption. Source text stays in this operator tab.
        A plain word masks it; <code>word=&gt;replacement</code> substitutes text;
        <code>word=&gt;!hide</code> blanks the whole caption.
      </p>
      {hasService ? (
        <ManualOverridesGroup
          quickBlockEntries={manualOverrides.quickBlockEntries}
          onAddQuickBlock={manualOverrides.onAddQuickBlock}
          onRemoveQuickBlock={manualOverrides.onRemoveQuickBlock}
          isPaused={manualOverrides.isPaused}
          isBusy={manualOverrides.isBusy}
          controlBusy={manualOverrides.controlBusy}
          manualCaptionBusy={manualOverrides.manualCaptionBusy}
          onShowManualCaption={manualOverrides.onShowManualCaption}
          outputBuffer={{
            show: manualOverrides.outputBufferCount > 0,
            queue: manualOverrides.outputBufferQueue,
            onPause: manualOverrides.onOutputBufferPause,
            onClear: manualOverrides.onOutputBufferClear,
            onFastForward: manualOverrides.onOutputBufferFastForward,
            onBeginEdit: manualOverrides.onOutputBufferBeginEdit,
            onEditDraftChange: manualOverrides.onOutputBufferEditDraftChange,
            onCancelEdit: manualOverrides.onOutputBufferCancelEdit,
            onSubmitEdit: manualOverrides.onOutputBufferSubmitEdit,
          }}
        />
      ) : (
        <p className="privacyNote">
          Start captions to use quick block, manual caption, or the output-buffer queue.
        </p>
      )}
    </div>
  );
}
