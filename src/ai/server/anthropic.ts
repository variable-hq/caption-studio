import Anthropic from "@anthropic-ai/sdk";

import type { TranslationRequest, TranslationResult } from "@/ai/contracts";
import { outputLooksUnsafe } from "@/ai/output-guard";
import { normalizeLlmTokenUsage } from "@/ai/usage";
import { isLanguageLocale } from "@/domain/languages";
import type { ProviderTelemetry } from "@/experience/metering";
import {
  ProviderError,
  REASONING_TRANSLATION_COMPLETION_TOKENS,
  buildTranslationMessages,
  providerKeyRejectedError,
  providerRateLimitedError,
  type InferenceTarget,
} from "./groq";

function client(target: InferenceTarget) {
  const apiKey = target.apiKey?.trim();
  if (!apiKey) {
    throw new ProviderError(
      "No Claude API key is saved. Add it in Settings › AI providers.",
      503, undefined, undefined, undefined, "provider_key_missing",
    );
  }
  // One attempt per metered dispatch: the usage ledger admits each attempt once.
  return new Anthropic({ apiKey, maxRetries: 0, timeout: 15_000 });
}

// Effort and server-side refusal fallbacks exist only on current models; older ids
// (Haiku 4.5, Sonnet 4.5, Claude 3) reject them.
function supportsEffort(model: string) {
  return !/^claude-(3|haiku-4|sonnet-4-5|opus-4-[01])/u.test(model);
}

function supportsServerFallback(model: string) {
  return supportsEffort(model) && !model.startsWith("claude-haiku");
}

function providerErrorFrom(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return providerKeyRejectedError("anthropic", error.status);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return providerRateLimitedError("anthropic", error.headers?.get("retry-after") ?? undefined, undefined, 429);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ProviderError("The cloud AI provider timed out. The caption session remains available to retry.", 504);
  }
  if (error instanceof Anthropic.APIUserAbortError) {
    return new ProviderError("The translation request was cancelled.", 499);
  }
  if (error instanceof Anthropic.APIError) {
    return new ProviderError("The cloud AI provider could not complete the request.", 502, undefined, undefined, error.status);
  }
  return new ProviderError("The cloud AI provider is unreachable.", 502);
}

/** Maps the shared translation messages onto the Messages API's system + user shape. */
export function anthropicTranslationParams(target: InferenceTarget, request: TranslationRequest) {
  const [system, user] = buildTranslationMessages(request);
  const fallback = supportsServerFallback(target.model);
  return {
    model: target.model,
    // Thinking stays at the model default (adaptive); low effort keeps live latency down,
    // and the larger cap leaves room for thinking before the short caption.
    max_tokens: REASONING_TRANSLATION_COMPLETION_TOKENS,
    system: system.content,
    messages: [{ role: "user" as const, content: user.content }],
    ...(supportsEffort(target.model) ? { output_config: { effort: "low" as const } } : {}),
    ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
}

export async function translateWithAnthropic(
  request: TranslationRequest,
  target: InferenceTarget,
  signal?: AbortSignal,
  telemetry?: ProviderTelemetry,
): Promise<TranslationResult> {
  if (!isLanguageLocale(request.sourceLanguage) || !isLanguageLocale(request.targetLanguage)) {
    throw new ProviderError("Unsupported language selection.", 400);
  }
  const anthropic = client(target);
  if (telemetry) await telemetry.dispatch(target.model, "anthropic");
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await anthropic.beta.messages.create(anthropicTranslationParams(target, request), { signal });
  } catch (error) {
    throw providerErrorFrom(error);
  }

  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
  // Only a natural end is publishable; refusal, max_tokens and the rest are incomplete.
  const incomplete = response.stop_reason !== "end_turn" || !text || outputLooksUnsafe(text);
  const usage = normalizeLlmTokenUsage({
    promptTokens: response.usage.input_tokens,
    completionTokens: response.usage.output_tokens,
    totalTokens: response.usage.input_tokens + response.usage.output_tokens,
  });
  if (telemetry && usage) telemetry.tokens = usage;

  return {
    text: incomplete ? "" : text,
    ...(incomplete ? { incomplete: true as const } : {}),
    ...(usage ? { usage } : {}),
  };
}

/** Confirms the key works and the chosen model exists, without spending tokens. */
export async function verifyAnthropicModel(target: InferenceTarget) {
  try {
    await client(target).models.retrieve(target.model);
  } catch (error) {
    if (error instanceof Anthropic.NotFoundError) {
      throw new ProviderError(`The Claude model ${target.model} is not available to this key.`, 503);
    }
    throw providerErrorFrom(error);
  }
}
