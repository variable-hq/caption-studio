import { rpc, type AutoSummaryRequest, type ExperienceEnvironment } from "./contracts";
import { WORKSPACE_SETUP_KEY, effectiveSetup, normalizeOperatorPreferences, operatorIdentityKey } from "./preferences";
import { normalizeSummaryOptions } from "./summary-defaults";

/**
 * Best-effort, called after End succeeds: when the church setup (or, before anyone saved
 * one, the ending operator's own setup) opts in, asks the session's journal to generate
 * a summary from the saved summary defaults once it has ended.
 */
export async function queueAutoSummary(env: ExperienceEnvironment, serviceId: string, identity: string) {
  if (!env.OPERATOR_PREFERENCES || !env.SERMON_JOURNALS || env.CAPTION_OPTIONAL_AI_ENABLED !== "true") return;
  const [shared, personal] = await Promise.all([
    rpc(env.OPERATOR_PREFERENCES, WORKSPACE_SETUP_KEY, "/preferences"),
    rpc(env.OPERATOR_PREFERENCES, await operatorIdentityKey(identity), "/preferences"),
  ]);
  if (!shared.ok || !personal.ok) return;
  const preferences = effectiveSetup(
    normalizeOperatorPreferences(await shared.json()),
    normalizeOperatorPreferences(await personal.json()),
  );
  if (!preferences.autoSummary) return;
  await rpc(env.SERMON_JOURNALS, serviceId, "/auto-summary", {
    options: normalizeSummaryOptions(preferences.summaryDefaults ?? {}),
  } satisfies AutoSummaryRequest);
}
