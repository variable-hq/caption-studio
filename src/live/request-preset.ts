import { resolveWorkspacePreset, type Preset } from "@/experience/presets";
import type { LiveSessionDetails } from "@/live/contracts";

/**
 * The format a request carries: a running session's own (General when it began before formats),
 * else the Start bar's choice for the session about to begin.
 */
export function requestPresetId(session: Pick<LiveSessionDetails, "presetId"> | null, chosen: string | undefined) {
  return session ? session.presetId ?? "builtin:general" : chosen;
}

/**
 * The format a session's messages and banners are worded in: the running session's own, else the
 * Start bar's choice (see `requestPresetId`).
 */
export function messagePresetFor(session: Pick<LiveSessionDetails, "presetId"> | null, chosen: string | undefined): Preset {
  return resolveWorkspacePreset(requestPresetId(session, chosen));
}
