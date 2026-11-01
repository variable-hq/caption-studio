import { describe, expect, it } from "vitest";

import { CloudProviderClientError } from "@/ai/cloud-provider-client";
import { isProviderLimitError } from "@/live/provider-limit";

const NOW = "2026-11-01T00:00:00.000Z";

function limitSnapshot(remaining: { day?: number; minute?: number }) {
  return {
    model: "synthetic-model",
    observedAt: NOW,
    requestsPerDay:
      remaining.day === undefined
        ? null
        : { limit: 1_000, remaining: remaining.day, reset: null },
    tokensPerMinute:
      remaining.minute === undefined
        ? null
        : { limit: 1_000, remaining: remaining.minute, reset: null },
  };
}

describe("provider limit detection", () => {
  it("recognises a rate-limit response", () => {
    expect(isProviderLimitError(new CloudProviderClientError("busy", undefined, undefined, undefined, 429))).toBe(true);
  });

  it("recognises a reported limit with no headroom", () => {
    expect(isProviderLimitError(new CloudProviderClientError(
      "busy",
      undefined,
      limitSnapshot({ day: 0 }),
    ))).toBe(true);
    expect(isProviderLimitError(new CloudProviderClientError(
      "busy",
      undefined,
      limitSnapshot({ minute: 0 }),
    ))).toBe(true);
  });

  it("ignores headroom, other errors and non-provider errors", () => {
    expect(isProviderLimitError(new CloudProviderClientError(
      "translation incomplete",
      "translation_incomplete",
      limitSnapshot({ day: 999, minute: 999 }),
    ))).toBe(false);
    expect(isProviderLimitError(new Error("network failed"))).toBe(false);
    expect(isProviderLimitError(null)).toBe(false);
  });
});
