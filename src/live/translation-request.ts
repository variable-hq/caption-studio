import type { TranslationResult } from "@/ai/contracts";
import { normalizeLlmTokenUsage } from "@/ai/usage";
import {
  authorizeProtectedAiRequest,
  claimTranslationAttempt,
  recordTranslationUsage,
  type LiveWorkerEnvironment,
} from "@/live/api";

function translationControlError(error: string, code: string) {
  return Response.json(
    { error, code },
    {
      status: 503,
      headers: { "cache-control": "no-store" },
    },
  );
}

export async function handleTranslationRequest(
  request: Request,
  env: LiveWorkerEnvironment,
  invokeProviderRoute: () => Promise<Response>,
) {
  const accessError = await authorizeProtectedAiRequest(request, env);
  if (accessError) return accessError;

  const controllerToken =
    request.headers.get("x-caption-controller")?.trim() ?? "";
  const transcriptionAttempt = Number(
    request.headers.get("x-caption-transcription-attempt"),
  );

  let claimResponse: Response;
  try {
    claimResponse = await claimTranslationAttempt(
      env,
      controllerToken,
      transcriptionAttempt,
    );
  } catch {
    return translationControlError(
      "Translation authorization could not be confirmed. Captions stopped before provider usage.",
      "translation_authorization_unavailable",
    );
  }
  if (!claimResponse.ok) return claimResponse;

  const response = await invokeProviderRoute();
  if (!response.ok) return response;

  try {
    const result = (await response.clone().json()) as TranslationResult;
    if (!normalizeLlmTokenUsage(result.usage)) {
      throw new Error("Provider token usage unavailable.");
    }
    const usageResponse = await recordTranslationUsage(
      env,
      controllerToken,
      transcriptionAttempt,
      result,
    );
    if (!usageResponse.ok) throw new Error("Usage record rejected.");
  } catch {
    return translationControlError(
      "Translation completed, but its usage could not be recorded. Captions stopped to keep the service limit reliable.",
      "translation_usage_unavailable",
    );
  }
  return response;
}
