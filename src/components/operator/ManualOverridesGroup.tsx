"use client";

import { ManualCaptionControl } from "@/components/operator/ManualCaptionControl";
import { OutputBufferQueueControl } from "@/components/operator/OutputBufferQueueControl";
import { LiveWordControl } from "@/components/operator/LiveWordControl";
import type { LiveWordEntry } from "@/live/live-words";
import type { OutputBufferQueueState } from "@/live/output-buffer";
import type { WordRow } from "@/live/words";

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
  liveWordEntries: readonly LiveWordEntry[];
  onAddLiveWord: (row: WordRow) => void;
  onRemoveLiveWord: (id: string) => void;
  onKeepLiveWordInWords: (row: WordRow) => void;
  isPaused: boolean;
  isBusy: boolean;
  controlBusy: boolean;
  manualCaptionBusy: boolean;
  onShowManualCaption: (text: string) => void;
  outputBuffer: OutputBufferQueueProps;
}

/** Operator overrides of what the pipeline would otherwise publish: immediate word fixes,
 * a typed replacement caption while paused, or the output buffer's queued caption.
 * Only shown in the expanded panel. */
export function ManualOverridesGroup({
  liveWordEntries,
  onAddLiveWord,
  onRemoveLiveWord,
  onKeepLiveWordInWords,
  isPaused,
  isBusy,
  controlBusy,
  manualCaptionBusy,
  onShowManualCaption,
  outputBuffer,
}: ManualOverridesGroupProps) {
  return (
    <div className="manualOverrides" role="group" aria-label="Caption controls">
      <span className="manualOverridesLabel">Caption controls</span>
      <LiveWordControl
        entries={liveWordEntries}
        onAdd={onAddLiveWord}
        onRemove={onRemoveLiveWord}
        onKeepInWords={onKeepLiveWordInWords}
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
