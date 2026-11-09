import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { LlmTokenUsage } from "@/ai/contracts";
import type { AiProviderId } from "@/ai/providers";
import { captionTokenHash } from "@/live/caption-room";
import { rpc, type ExperienceEnvironment } from "./contracts";
import type { LiveWorkerEnvironment } from "@/live/api";

export interface ProviderTelemetry {
  dispatch(model: string, provider?: AiProviderId): Promise<void>;
  tokens?: LlmTokenUsage;
  audioSeconds?: number;
}

export async function meteredGroq<T>(request: Request, stage: "transcription" | "translation",
  invoke: (telemetry?: ProviderTelemetry) => Promise<T>): Promise<T> {
  let env: LiveWorkerEnvironment & ExperienceEnvironment;
  try { env = getCloudflareContext().env as unknown as LiveWorkerEnvironment; }
  catch {
    if (process.env.NODE_ENV !== "production") return invoke();
    throw new Error("AI usage storage is unavailable.");
  }
  if (!env.AI_USAGE) throw new Error("AI usage storage is not configured.");
  const attempt = Number(request.headers.get("x-caption-transcription-attempt"));
  const context = await rpc(env.CAPTION_ROOMS, "channel:main", "/internal/experience/context", {
    controllerHash: await captionTokenHash(request.headers.get("x-caption-controller") ?? ""),
    transcriptionAttempt: attempt, stage,
  });
  if (!context.ok) throw new Error("AI service authorization is no longer valid.");
  const { sessionId } = await context.json() as { sessionId: string };
  const id = `${sessionId}:${stage}:${attempt}`;
  let dispatched = false;
  const telemetry: ProviderTelemetry = {
    async dispatch(model, provider = "groq") {
      const admission = await rpc(env.AI_USAGE!, "usage", "/admit", {
        id, sessionId, stage, provider, model, reservedNeurons: 0,
      });
      if (!admission.ok) throw new Error("AI usage admission failed before provider dispatch.");
      dispatched = true;
    },
  };
  try {
    return await invoke(telemetry);
  } finally {
    if (dispatched) {
      const response = await rpc(env.AI_USAGE, "usage", "/finish", {
        id, status: telemetry.tokens || telemetry.audioSeconds !== undefined ? "completed" : "unknown",
        tokens: telemetry.tokens, audioSeconds: telemetry.audioSeconds,
      });
      if (!response.ok) throw new Error("AI usage acknowledgement failed; do not replay this request.");
    }
  }
}
