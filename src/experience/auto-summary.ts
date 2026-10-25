import { rpc, type AutoSummaryRequest, type ExperienceEnvironment } from "./contracts";
import { normalizeOperatorPreferences, operatorIdentityKey } from "./preferences";
import { normalizeSummaryOptions } from "./summary-defaults";

/**
 * Best-effort, called after End succeeds: when the ending operator opted in, asks the
 * service's journal to generate a summary from their saved defaults once it has ended.
 */
export async function queueAutoSummary(env: ExperienceEnvironment, serviceId: string, identity: string) {
  if (!env.OPERATOR_PREFERENCES || !env.SERMON_JOURNALS || env.CAPTION_OPTIONAL_AI_ENABLED !== "true") return;
  const stored = await rpc(env.OPERATOR_PREFERENCES, await operatorIdentityKey(identity), "/preferences");
  if (!stored.ok) return;
  const preferences = normalizeOperatorPreferences(await stored.json());
  if (!preferences.autoSummary) return;
  await rpc(env.SERMON_JOURNALS, serviceId, "/auto-summary", {
    options: normalizeSummaryOptions(preferences.summaryDefaults ?? {}),
  } satisfies AutoSummaryRequest);
}
