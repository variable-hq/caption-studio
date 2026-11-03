import { GENERAL_PRESET_ID, normalizeProfileId, type BuiltInPresetId } from "@/experience/presets";

/**
 * The format a running session fixed at start, or null when no session is running. A session that
 * began before formats, or whose id is not a built-in, is General. The controlling tab's own
 * details come first, then a watching tab's.
 */
export function runningSessionFormat(
  running: boolean,
  controllerPresetId: string | undefined,
  observerPresetId: string | undefined,
): BuiltInPresetId | null {
  if (!running) return null;
  return normalizeProfileId(controllerPresetId ?? observerPresetId) ?? GENERAL_PRESET_ID;
}

/** Live and Transcripts follow a running session's format; Settings and Help keep the workspace's. */
export function screenFollowsSessionFormat(screen: "live" | "transcripts" | "settings" | "help", sessionFormat: BuiltInPresetId | null) {
  return sessionFormat !== null && (screen === "live" || screen === "transcripts");
}
