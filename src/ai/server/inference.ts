import type { TranslationRequest, TranslationResult } from "@/ai/contracts";
import { AI_PROVIDER_LABELS, effectiveTranscriptionModel, effectiveTranslationModel } from "@/ai/providers";
import type { ProviderTelemetry } from "@/experience/metering";
import { translateWithAnthropic, verifyAnthropicModel } from "./anthropic";
import {
  ProviderError,
  getCloudProviderHealth,
  listOpenAiCompatibleModels,
  translateOpenAiCompatible,
  verifyGroqProvider,
  type InferenceTarget,
} from "./groq";
import { loadWorkspaceProviderSettings, resolveInferenceTarget, selectionsOf, workspaceInferenceTarget } from "./provider-routing";

export { transcribeAudio } from "./groq";
export { workspaceInferenceTarget };

export function translateCaption(
  request: TranslationRequest,
  target: InferenceTarget,
  signal?: AbortSignal,
  telemetry?: ProviderTelemetry,
): Promise<TranslationResult> {
  return target.provider === "anthropic"
    ? translateWithAnthropic(request, target, signal, telemetry)
    : translateOpenAiCompatible(request, target, signal, telemetry);
}

async function verifyTarget(target: InferenceTarget) {
  if (target.provider === "anthropic") return verifyAnthropicModel(target);
  const models = await listOpenAiCompatibleModels(target);
  if (!models.has(target.model)) {
    throw new ProviderError(`The ${AI_PROVIDER_LABELS[target.provider]} model ${target.model} is not available to this key.`, 503);
  }
}

/**
 * Non-secret status for `/api/ai/health`: the deployment's Groq readiness plus the
 * workspace's chosen provider and model per stage. A saved-key provider counts as
 * configured when its key is saved; readiness is what proves the key works.
 */
export async function workspaceProviderHealth() {
  const base = getCloudProviderHealth();
  let settings;
  try {
    settings = await loadWorkspaceProviderSettings();
  } catch {
    return { ...base, status: "unavailable" as const };
  }
  const selections = selectionsOf(settings);
  const stage = (name: "transcription" | "translation") => {
    const selection = selections[name];
    if (selection.provider === "groq") {
      return { ...base[name], provider: "groq" as const, ...(selection.model ? { model: selection.model } : {}) };
    }
    const ready = Boolean(settings?.keys[selection.provider as keyof NonNullable<typeof settings>["keys"]]);
    const model = name === "transcription"
      ? effectiveTranscriptionModel(selections.transcription)
      : effectiveTranslationModel(selections.translation);
    return { ready, model, provider: selection.provider };
  };
  const transcription = stage("transcription");
  const translation = stage("translation");
  const ready = base.access.ready && transcription.ready && translation.ready;
  return { ...base, status: ready ? ("ready" as const) : ("not-configured" as const), transcription, translation };
}

/** Readiness: proves each chosen provider accepts its key and offers the chosen model. */
export async function verifyWorkspaceProviders() {
  const settings = await loadWorkspaceProviderSettings();
  const selections = selectionsOf(settings);
  // The deployment's Groq defaults are checked as before; verifyTarget also covers a
  // workspace-entered Groq model, which the deployment check does not know about.
  const usesDefaultGroq = (["transcription", "translation"] as const)
    .some((stage) => selections[stage].provider === "groq" && !selections[stage].model);
  if (usesDefaultGroq) await verifyGroqProvider();
  for (const stage of ["transcription", "translation"] as const) {
    if (selections[stage].provider === "groq" && !selections[stage].model) continue;
    await verifyTarget(await workspaceInferenceTarget(stage));
  }
  return workspaceProviderHealth();
}

export { resolveInferenceTarget };
