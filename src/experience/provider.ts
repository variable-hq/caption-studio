import { normalizeLlmTokenUsage } from "@/ai/usage";
import { rpc, type ExperienceEnvironment, type SummaryModel, type UsageStage } from "./contracts";

const rates = (model: string) => model.includes("3.3-70b") ? [26668, 204805] : [13778, 26128];
function estimateNeurons(model: string, input: number, output: number) {
  const [inputRate, outputRate] = rates(model);
  return Math.ceil((input * inputRate + output * outputRate) / 1_000_000);
}

export async function optionalInference(env: ExperienceEnvironment, serviceId: string,
  stage: Extract<UsageStage, "reader" | "summary">, model: SummaryModel,
  messages: readonly { role: string; content: string }[]) {
  if (!env.AI || !env.AI_USAGE || env.CAPTION_OPTIONAL_AI_ENABLED !== "true") {
    throw new Error("Optional AI is not enabled. Translated text remains available.");
  }
  const bytes = new TextEncoder().encode(messages.map((message) => message.content).join("")).length;
  // UTF-8 bytes conservatively bound byte-level tokenizer input size; reserve output separately.
  const maxTokens = stage === "reader" ? 600 : 2000;
  if (bytes + maxTokens > 22_000) throw new Error("Summary section exceeds its context budget.");
  const id = `${stage}:${crypto.randomUUID()}`;
  const admission = await rpc(env.AI_USAGE, "usage", "/admit", {
    id, serviceId, stage, provider: "cloudflare", model,
    reservedNeurons: estimateNeurons(model, bytes, maxTokens),
  });
  if (!admission.ok) throw new Error("Optional AI daily budget unavailable. Retry after reset.");
  let payload: { response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    payload = await Promise.race([
      env.AI.run(model, { messages, max_tokens: maxTokens, temperature: 0 }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Inference timed out.")), 45_000); }),
    ]) as typeof payload;
  } catch {
    await rpc(env.AI_USAGE, "usage", "/finish", { id, status: "unknown" });
    throw new Error("Optional AI request failed; its consumption may be unknown.");
  } finally { clearTimeout(timer); }
  const tokens = normalizeLlmTokenUsage({ promptTokens: payload.usage?.prompt_tokens,
    completionTokens: payload.usage?.completion_tokens, totalTokens: payload.usage?.total_tokens });
  const recorded = await rpc(env.AI_USAGE, "usage", "/finish", { id,
    status: tokens ? "completed" : "unknown", tokens,
    estimatedNeurons: tokens ? estimateNeurons(model, tokens.promptTokens, tokens.completionTokens) : 0 });
  if (!recorded.ok) throw new Error("AI usage acknowledgement failed.");
  if (typeof payload.response !== "string" || !payload.response.trim()) throw new Error("AI returned no usable text.");
  return payload.response.trim();
}
