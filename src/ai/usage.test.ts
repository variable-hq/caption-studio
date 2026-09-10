import { describe, expect, it } from "vitest";

import {
  accumulateLlmSessionUsage,
  consumptionPercent,
  consumptionStatus,
  emptyLlmSessionUsage,
  normalizeLlmSessionUsage,
  normalizeLlmTokenUsage,
  providerRateLimitFromHeaders,
  withLlmProviderRateLimit,
} from "@/ai/usage";

describe("LLM consumption normalization", () => {
  it("normalizes provider tokens without allowing negative or inconsistent totals", () => {
    expect(
      normalizeLlmTokenUsage({
        promptTokens: 120,
        completionTokens: 24,
        totalTokens: 100,
      }),
    ).toEqual({
      promptTokens: 120,
      completionTokens: 24,
      totalTokens: 144,
    });
    expect(
      normalizeLlmTokenUsage({
        promptTokens: -1,
        completionTokens: "24",
        totalTokens: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull();
  });

  it("parses the documented daily-request and minute-token headers", () => {
    const snapshot = providerRateLimitFromHeaders(
      new Headers({
        "x-ratelimit-limit-requests": "1000",
        "x-ratelimit-remaining-requests": "978",
        "x-ratelimit-reset-requests": "14h22m",
        "x-ratelimit-limit-tokens": "8000",
        "x-ratelimit-remaining-tokens": "6120",
        "x-ratelimit-reset-tokens": "7.66s",
      }),
      "openai/gpt-oss-20b",
      new Date("2026-08-23T08:00:00.000Z"),
    );

    expect(snapshot).toEqual({
      model: "openai/gpt-oss-20b",
      observedAt: "2026-08-23T08:00:00.000Z",
      requestsPerDay: { limit: 1000, remaining: 978, reset: "14h22m" },
      tokensPerMinute: { limit: 8000, remaining: 6120, reset: "7.66s" },
    });
  });

  it("treats missing or malformed provider headers as unknown, never zero", () => {
    expect(
      providerRateLimitFromHeaders(
        new Headers({
          "x-ratelimit-limit-requests": "1000",
          "x-ratelimit-remaining-requests": "-1",
          "x-ratelimit-limit-tokens": "secret",
        }),
        "openai/gpt-oss-20b",
      ),
    ).toBeNull();
  });

  it("accumulates successful calls monotonically and keeps the latest headroom", () => {
    const first = accumulateLlmSessionUsage(emptyLlmSessionUsage(), {
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
    });
    const snapshot = providerRateLimitFromHeaders(
      new Headers({
        "x-ratelimit-limit-requests": "1000",
        "x-ratelimit-remaining-requests": "999",
      }),
      "openai/gpt-oss-20b",
      new Date("2026-08-23T08:00:00.000Z"),
    );
    const second = accumulateLlmSessionUsage(first, {
      usage: { promptTokens: 80, completionTokens: 12, totalTokens: 92 },
      rateLimit: snapshot ?? undefined,
    });

    expect(second).toMatchObject({
      translationRequests: 2,
      promptTokens: 180,
      completionTokens: 32,
      totalTokens: 212,
      providerRateLimit: snapshot,
    });
    expect(
      withLlmProviderRateLimit(second, {
        model: "",
        observedAt: "invalid",
      }),
    ).toEqual(second);
  });

  it("does not let an out-of-order response replace newer provider headroom", () => {
    const newer = providerRateLimitFromHeaders(
      new Headers({
        "x-ratelimit-limit-requests": "1000",
        "x-ratelimit-remaining-requests": "998",
      }),
      "openai/gpt-oss-20b",
      new Date("2026-08-23T08:00:02.000Z"),
    );
    const older = providerRateLimitFromHeaders(
      new Headers({
        "x-ratelimit-limit-requests": "1000",
        "x-ratelimit-remaining-requests": "999",
      }),
      "openai/gpt-oss-20b",
      new Date("2026-08-23T08:00:01.000Z"),
    );

    const current = accumulateLlmSessionUsage(emptyLlmSessionUsage(), {
      rateLimit: newer ?? undefined,
    });
    expect(
      accumulateLlmSessionUsage(current, {
        usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
        rateLimit: older ?? undefined,
      }).providerRateLimit,
    ).toEqual(newer);
    expect(withLlmProviderRateLimit(current, older)).toEqual(current);
  });

  it("normalizes legacy or corrupt stored service usage to safe zeroes", () => {
    expect(normalizeLlmSessionUsage(undefined)).toEqual(
      emptyLlmSessionUsage(),
    );
    expect(
      normalizeLlmSessionUsage({
        translationRequests: -5,
        promptTokens: 10,
        completionTokens: 2,
        totalTokens: 1,
      }),
    ).toMatchObject({
      translationRequests: 0,
      promptTokens: 10,
      completionTokens: 2,
      totalTokens: 12,
    });
  });

  it("derives bounded progress and text states without relying on colour", () => {
    expect(consumptionPercent(0, 100)).toBe(0);
    expect(consumptionPercent(200, 100)).toBe(100);
    expect(consumptionStatus(0, 100)).toBe("Not started");
    expect(consumptionStatus(79, 100)).toBe("Within limit");
    expect(consumptionStatus(80, 100)).toBe("Approaching limit");
    expect(consumptionPercent(999, 1_000)).toBe(100);
    expect(consumptionStatus(999, 1_000)).toBe("Approaching limit");
    expect(consumptionStatus(896, 900)).toBe("Approaching limit");
    expect(consumptionStatus(100, 100)).toBe("Limit reached");
  });
});
