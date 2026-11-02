"use client";

import { ManualCaptionControl } from "@/components/operator/ManualCaptionControl";
import { LiveWordControl } from "@/components/operator/LiveWordControl";
import { useT } from "@/i18n/provider";
import type { LiveWordEntry } from "@/live/live-words";
import type { WordRow } from "@/live/words";

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
}

/** Operator overrides of what the pipeline would otherwise publish: immediate word fixes
 * or a typed replacement caption while paused. Only shown in the expanded panel. */
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
}: ManualOverridesGroupProps) {
  const t = useT();
  return (
    <div className="manualOverrides" role="group" aria-label={t("manualOverrides.label")}>
      <span className="manualOverridesLabel">{t("manualOverrides.label")}</span>
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
    </div>
  );
}
