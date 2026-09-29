"use client";

interface AudioLevelMeterProps {
  level: number;
}

/** The microphone input level meter, shared between the Audio input section and the live console. */
export function AudioLevelMeter({ level }: AudioLevelMeterProps) {
  return (
    <div className="meterRow">
      <div
        className="meter"
        role="meter"
        aria-label="Microphone input level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level * 100)}
        aria-valuetext={`${Math.round(level * 100)} percent`}
      >
        <span style={{ width: `${level * 100}%` }} />
      </div>
      <span>{Math.round(level * 100)}%</span>
    </div>
  );
}
