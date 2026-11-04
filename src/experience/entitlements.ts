import { BUILT_IN_PRESET_IDS, type BuiltInPresetId } from "./presets";

/**
 * Workspace plan limits. The plan is one Worker variable, `WORKSPACE_PLAN` (docs/DEPLOYMENT.md).
 * It is never read from the shared setup record, which every signed-in operator can edit.
 */
export const DEFAULT_MAX_CUSTOM_PRESETS = 5;

/** Known plans. A plan not listed here, or no plan, uses the default limits. */
const PLAN_MAX_CUSTOM_PRESETS: ReadonlyMap<string, number> = new Map([["free", 0]]);

export type PresetLimits = {
  maxCustomPresets: number;
  /** Built-in formats the workspace may choose; every built-in on every plan today. */
  allowedProfiles: readonly BuiltInPresetId[];
};

export function presetLimits(plan: unknown): PresetLimits {
  const known = typeof plan === "string" ? PLAN_MAX_CUSTOM_PRESETS.get(plan) : undefined;
  return {
    maxCustomPresets: known ?? DEFAULT_MAX_CUSTOM_PRESETS,
    allowedProfiles: BUILT_IN_PRESET_IDS,
  };
}
