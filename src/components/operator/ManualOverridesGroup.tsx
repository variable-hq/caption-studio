"use client";

import { ManualCaptionControl } from "@/components/operator/ManualCaptionControl";
import { OutputBufferQueueControl } from "@/components/operator/OutputBufferQueueControl";
import { QuickBlockControl } from "@/components/operator/QuickBlockControl";
import type { OutputBufferQueueState } from "@/live/output-buffer";
import type { QuickBlockEntry } from "@/live/quick-block";

interface OutputBufferQueueProps {
  show: boolean;
  queue: OutputBufferQueueState;
  onPause: (id: string, paused: boolean) => void;
  onClear: (id: string) => void;
  onFastForward: (id: string) => void;
  onBeginEdit: (id: string) => void;
  onEditDraftChange: (id: string, text: string) => void;
  onCancelEdit: (id: string) => void;
  onSubmitEdit: (id: string) => void;
}

interface ManualOverridesGroupProps {
  quickBlockEntries: readonly QuickBlockEntry[];
  onAddQuickBlock: (term: string) => void;
  onRemoveQuickBlock: (id: string) => void;
  isPaused: boolean;
  isBusy: boolean;
  controlBusy: boolean;
  manualCaptionBusy: boolean;
  onShowManualCaption: (text: string) => void;
  outputBuffer: OutputBufferQueueProps;
}

/** Operator overrides of what the pipeline would otherwise publish: instant word block,
 * a typed replacement caption while paused, or the output buffer's queued caption.
 * Only shown in the expanded panel. */
export function ManualOverridesGroup({
  quickBlockEntries,
  onAddQuickBlock,
  onRemoveQuickBlock,
  isPaused,
  isBusy,
  controlBusy,
  manualCaptionBusy,
  onShowManualCaption,
  outputBuffer,
}: ManualOverridesGroupProps) {
  return (
    <div className="manualOverrides" aria-label="Manual overrides">
      <span className="manualOverridesLabel">Manual overrides</span>
      <QuickBlockControl
        entries={quickBlockEntries}
        onAdd={onAddQuickBlock}
        onRemove={onRemoveQuickBlock}
        disabled={isBusy}
      />
      {isPaused && (
        <ManualCaptionControl
          disabled={isBusy || controlBusy}
          busy={manualCaptionBusy}
          onShow={onShowManualCaption}
        />
      )}
      {outputBuffer.show && (
        <OutputBufferQueueControl
          queue={outputBuffer.queue}
          disabled={isBusy}
          onPause={outputBuffer.onPause}
          onClear={outputBuffer.onClear}
          onFastForward={outputBuffer.onFastForward}
          onBeginEdit={outputBuffer.onBeginEdit}
          onEditDraftChange={outputBuffer.onEditDraftChange}
          onCancelEdit={outputBuffer.onCancelEdit}
          onSubmitEdit={outputBuffer.onSubmitEdit}
        />
      )}
    </div>
  );
}
