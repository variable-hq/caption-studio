"use client";

import { ManualCaptionControl } from "@/components/operator/ManualCaptionControl";
import { QuickBlockControl } from "@/components/operator/QuickBlockControl";
import type { QuickBlockEntry } from "@/live/quick-block";

interface ManualOverridesGroupProps {
  quickBlockEntries: readonly QuickBlockEntry[];
  onAddQuickBlock: (term: string) => void;
  onRemoveQuickBlock: (id: string) => void;
  isPaused: boolean;
  isBusy: boolean;
  controlBusy: boolean;
  manualCaptionBusy: boolean;
  onShowManualCaption: (text: string) => void;
}

/** Operator overrides of what the pipeline would otherwise publish: instant word block,
 * or a typed replacement caption while paused. Only shown in the expanded panel. */
export function ManualOverridesGroup({
  quickBlockEntries,
  onAddQuickBlock,
  onRemoveQuickBlock,
  isPaused,
  isBusy,
  controlBusy,
  manualCaptionBusy,
  onShowManualCaption,
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
    </div>
  );
}
