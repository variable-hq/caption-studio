import type { SanitizeLevel } from "@/ai/contracts";

export interface TranscriptQualityMetrics {
  no_speech_prob?: unknown;
  avg_logprob?: unknown;
  compression_ratio?: unknown;
}

interface GuardThresholds {
  noSpeechProbAbove: number;
  avgLogprobBelow: number;
  compressionRatioAbove: number;
}

export const SANITIZE_GUARD_THRESHOLDS = {
  off: null,
  low: {
    noSpeechProbAbove: 0.8,
    avgLogprobBelow: -1.2,
    compressionRatioAbove: 3.0,
  },
  balanced: {
    noSpeechProbAbove: 0.6,
    avgLogprobBelow: -1.0,
    compressionRatioAbove: 2.4,
  },
  high: {
    noSpeechProbAbove: 0.5,
    avgLogprobBelow: -0.8,
    compressionRatioAbove: 2.4,
  },
} as const satisfies Record<SanitizeLevel, GuardThresholds | null>;

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Drops only silence-like or machine-loop segments; missing/invalid metadata keeps speech. */
export function shouldDropSegment(
  segment: TranscriptQualityMetrics,
  level: SanitizeLevel,
): boolean {
  const thresholds = SANITIZE_GUARD_THRESHOLDS[level];
  if (!thresholds) return false;

  const noSpeechProbability = finiteNumber(segment.no_speech_prob);
  const averageLogProbability = finiteNumber(segment.avg_logprob);
  const compressionRatio = finiteNumber(segment.compression_ratio);
  const likelyNoSpeech =
    noSpeechProbability !== null &&
    noSpeechProbability >= 0 &&
    noSpeechProbability <= 1 &&
    noSpeechProbability > thresholds.noSpeechProbAbove;
  const lowConfidence =
    averageLogProbability !== null &&
    averageLogProbability <= 0 &&
    averageLogProbability < thresholds.avgLogprobBelow;
  const machineLoop =
    compressionRatio !== null &&
    compressionRatio >= 0 &&
    compressionRatio > thresholds.compressionRatioAbove;

  return (likelyNoSpeech && lowConfidence) || machineLoop;
}
