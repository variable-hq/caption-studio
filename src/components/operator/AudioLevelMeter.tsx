"use client";

import { useI18n } from "@/i18n/provider";

interface AudioLevelMeterProps {
  level: number;
}

/** The microphone input level meter, shared between the Audio input section and the live console. */
export function AudioLevelMeter({ level }: AudioLevelMeterProps) {
  const { t } = useI18n();
  const percent = Math.round(level * 100);
  return (
    <div className="meterRow">
      <div
        className="meter"
        role="meter"
        aria-label={t("audio.levelLabel")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={t("audio.levelValue", { percent })}
      >
        <span style={{ width: `${level * 100}%` }} />
      </div>
      <span>{percent}%</span>
    </div>
  );
}
