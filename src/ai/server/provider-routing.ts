import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  AI_PROVIDER_LABELS,
  DEFAULT_PROVIDER_SELECTIONS,
  effectiveTranscriptionModel,
  effectiveTranslationModel,
  isKeyedProvider,
  type ProviderSelections,
} from "@/ai/providers";
import { WORKSPACE_PROVIDERS_KEY, normalizeStoredProviderSettings, type StoredProviderSettings } from "@/experience/provider-settings";
import type { LiveWorkerEnvironment } from "@/live/api";
import { ProviderError, groqTarget, type InferenceTarget } from "./groq";
import { ProviderKeyEncryptionError, decryptProviderKey } from "./provider-key-crypto";

export type InferenceStage = "transcription" | "translation";

function workerEnvironment(): LiveWorkerEnvironment | null {
  try {
    return getCloudflareContext().env as unknown as LiveWorkerEnvironment;
  } catch {
    return null;
  }
}

/**
 * Reads the workspace's stored choice. Outside the Worker (plain `npm run dev`) there is
 * no store and Groq is used; inside it, a store that cannot be read fails closed rather
 * than sending speech to a provider the workspace did not choose.
 */
export async function loadWorkspaceProviderSettings(env = workerEnvironment()): Promise<StoredProviderSettings | null> {
  if (!env) {
    if (process.env.NODE_ENV !== "production") return null;
    throw new ProviderError("AI provider settings are unavailable.", 503);
  }
  if (!env.OPERATOR_PREFERENCES) return null;
  let response: Response;
  try {
    const target = env.OPERATOR_PREFERENCES.get(env.OPERATOR_PREFERENCES.idFromName(WORKSPACE_PROVIDERS_KEY));
    response = await target.fetch(new Request("https://internal/providers/resolve", { signal: AbortSignal.timeout(5000) }));
  } catch {
    throw new ProviderError("AI provider settings could not be loaded. Captions stopped before provider usage.", 503);
  }
  if (!response.ok) throw new ProviderError("AI provider settings could not be loaded. Captions stopped before provider usage.", 503);
  return normalizeStoredProviderSettings(await response.json());
}

export function selectionsOf(settings: StoredProviderSettings | null): ProviderSelections {
  return settings?.selections ?? DEFAULT_PROVIDER_SELECTIONS;
}

/** The provider, model and (for a saved-key provider) decrypted key for one stage. */
export async function resolveInferenceTarget(
  stage: InferenceStage,
  settings: StoredProviderSettings | null,
  encryptionSecret?: string,
): Promise<InferenceTarget> {
  const selections = selectionsOf(settings);
  const selection = selections[stage];
  if (selection.provider === "groq") {
    const target = groqTarget(stage);
    // The deployment's model override applies only when the workspace left the model empty.
    return selection.model ? { ...target, model: selection.model } : target;
  }
  const model = stage === "transcription"
    ? effectiveTranscriptionModel(selections.transcription)
    : effectiveTranslationModel(selections.translation);
  const provider = selection.provider;
  const saved = isKeyedProvider(provider) ? settings?.keys[provider] : undefined;
  if (!isKeyedProvider(provider) || !saved) {
    throw new ProviderError(
      `No ${AI_PROVIDER_LABELS[provider]} API key is saved. Add it in Settings › AI providers.`,
      503, undefined, undefined, undefined, "provider_key_missing",
    );
  }
  try {
    return { provider, model, apiKey: await decryptProviderKey(provider, saved.ciphertext, encryptionSecret) };
  } catch (error) {
    if (error instanceof ProviderKeyEncryptionError) {
      throw new ProviderError(
        `The saved ${AI_PROVIDER_LABELS[provider]} API key cannot be read. Save it again in Settings › AI providers.`,
        503, undefined, undefined, undefined, "provider_key_unreadable",
      );
    }
    throw error;
  }
}

/** Resolves a stage's target from the running Worker's store and secret. */
export async function workspaceInferenceTarget(stage: InferenceStage): Promise<InferenceTarget> {
  const env = workerEnvironment();
  const settings = await loadWorkspaceProviderSettings(env);
  return resolveInferenceTarget(stage, settings, env?.PROVIDER_KEY_ENCRYPTION_KEY);
}
