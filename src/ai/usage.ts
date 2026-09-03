import type {
  LlmProviderRateLimitSnapshot,
  LlmSessionUsage,
  LlmTokenUsage,
  ProviderRateLimitWindow,
  TranslationResult,
} from "@/ai/contracts";

const MAX_PROVIDER_COUNTER = 1_000_000_000;
const MAX_RESET_LABEL_LENGTH = 64;

export type UsageStatus =
  | "Not started"
  | "Within limit"
  | "Approaching limit"
  | "Limit reached";

function boundedCounter(value: unknown, maximum = MAX_PROVIDER_COUNTER) {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Math.min(maximum, Number(value))
    : null;
}

function safeTotal(left: number, right: number) {
  return Math.min(Number.MAX_SAFE_INTEGER, left + right);
}

function latestProviderRateLimit(
  current: LlmProviderRateLimitSnapshot | null,
  candidate: LlmProviderRateLimitSnapshot | null,
) {
  if (!candidate) return current;
  if (!current) return candidate;
  return Date.parse(candidate.observedAt) >= Date.parse(current.observedAt)
    ? candidate
    : current;
}

function normalizeReset(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= MAX_RESET_LABEL_LENGTH
    ? normalized
    : null;
}

function normalizeRateLimitWindow(
  value: unknown,
): ProviderRateLimitWindow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<ProviderRateLimitWindow>;
  const limit = boundedCounter(candidate.limit);
  const remaining = boundedCounter(candidate.remaining);
  if (limit === null || remaining === null || limit === 0) return null;
  return {
    limit,
    remaining: Math.min(limit, remaining),
    reset: normalizeReset(candidate.reset),
  };
}

export function normalizeLlmTokenUsage(value: unknown): LlmTokenUsage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<LlmTokenUsage>;
  const promptTokens = boundedCounter(candidate.promptTokens);
  const completionTokens = boundedCounter(candidate.completionTokens);
  const totalTokens = boundedCounter(candidate.totalTokens);
  if (
    promptTokens === null &&
    completionTokens === null &&
    totalTokens === null
  ) {
    return null;
  }
  const normalizedPrompt = promptTokens ?? 0;
  const normalizedCompletion = completionTokens ?? 0;
  return {
    promptTokens: normalizedPrompt,
    completionTokens: normalizedCompletion,
    totalTokens: Math.max(
      totalTokens ?? 0,
      safeTotal(normalizedPrompt, normalizedCompletion),
    ),
  };
}

export function normalizeProviderRateLimitSnapshot(
  value: unknown,
): LlmProviderRateLimitSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<LlmProviderRateLimitSnapshot>;
  const model = typeof candidate.model === "string" ? candidate.model.trim() : "";
  const observedAt =
    typeof candidate.observedAt === "string" &&
    Number.isFinite(Date.parse(candidate.observedAt))
      ? new Date(candidate.observedAt).toISOString()
      : "";
  const requestsPerDay = normalizeRateLimitWindow(candidate.requestsPerDay);
  const tokensPerMinute = normalizeRateLimitWindow(candidate.tokensPerMinute);
  if (
    !model ||
    model.length > 160 ||
    !observedAt ||
    (!requestsPerDay && !tokensPerMinute)
  ) {
    return null;
  }
  return {
    model,
    observedAt,
    requestsPerDay,
    tokensPerMinute,
  };
}

function headerCounter(headers: Headers, name: string) {
  const value = headers.get(name)?.trim();
  if (!value || !/^\d+$/u.test(value)) return null;
  return boundedCounter(Number(value));
}

function headerWindow(
  headers: Headers,
  kind: "requests" | "tokens",
): ProviderRateLimitWindow | null {
  const limit = headerCounter(headers, `x-ratelimit-limit-${kind}`);
  const remaining = headerCounter(headers, `x-ratelimit-remaining-${kind}`);
  if (limit === null || remaining === null || limit === 0) return null;
  return {
    limit,
    remaining: Math.min(limit, remaining),
    reset: normalizeReset(headers.get(`x-ratelimit-reset-${kind}`)),
  };
}

export function providerRateLimitFromHeaders(
  headers: Headers,
  model: string,
  observedAt = new Date(),
): LlmProviderRateLimitSnapshot | null {
  const requestsPerDay = headerWindow(headers, "requests");
  const tokensPerMinute = headerWindow(headers, "tokens");
  if (!requestsPerDay && !tokensPerMinute) return null;
  return {
    model: model.slice(0, 160),
    observedAt: observedAt.toISOString(),
    requestsPerDay,
    tokensPerMinute,
  };
}

export function emptyLlmSessionUsage(): LlmSessionUsage {
  return {
    translationRequests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    providerRateLimit: null,
  };
}

export function normalizeLlmSessionUsage(value: unknown): LlmSessionUsage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyLlmSessionUsage();
  }
  const candidate = value as Partial<LlmSessionUsage>;
  const tokens = normalizeLlmTokenUsage(candidate) ?? {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  return {
    translationRequests: boundedCounter(candidate.translationRequests) ?? 0,
    ...tokens,
    providerRateLimit: normalizeProviderRateLimitSnapshot(
      candidate.providerRateLimit,
    ),
  };
}

export function accumulateLlmSessionUsage(
  current: unknown,
  result: Pick<TranslationResult, "usage" | "rateLimit">,
): LlmSessionUsage {
  const normalizedCurrent = normalizeLlmSessionUsage(current);
  const usage = normalizeLlmTokenUsage(result.usage);
  const rateLimit = normalizeProviderRateLimitSnapshot(result.rateLimit);
  return {
    translationRequests: safeTotal(
      normalizedCurrent.translationRequests,
      1,
    ),
    promptTokens: safeTotal(
      normalizedCurrent.promptTokens,
      usage?.promptTokens ?? 0,
    ),
    completionTokens: safeTotal(
      normalizedCurrent.completionTokens,
      usage?.completionTokens ?? 0,
    ),
    totalTokens: safeTotal(
      normalizedCurrent.totalTokens,
      usage?.totalTokens ?? 0,
    ),
    providerRateLimit: latestProviderRateLimit(
      normalizedCurrent.providerRateLimit,
      rateLimit,
    ),
  };
}

export function withLlmProviderRateLimit(
  current: unknown,
  rateLimit: unknown,
): LlmSessionUsage {
  const normalizedCurrent = normalizeLlmSessionUsage(current);
  const normalizedRateLimit = normalizeProviderRateLimitSnapshot(rateLimit);
  return {
    ...normalizedCurrent,
    providerRateLimit: latestProviderRateLimit(
      normalizedCurrent.providerRateLimit,
      normalizedRateLimit,
    ),
  };
}

export function consumptionPercent(used: number, limit: number) {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

export function consumptionStatus(used: number, limit: number): UsageStatus {
  if (used <= 0) return "Not started";
  const percent = consumptionPercent(used, limit);
  if (percent >= 100) return "Limit reached";
  if (percent >= 80) return "Approaching limit";
  return "Within limit";
}
