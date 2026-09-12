import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CloudProviderClient,
  CloudProviderClientError,
  isTerminalInferenceControlError,
} from "@/ai/cloud-provider-client";

const request = {
  text: "Grace",
  sourceLanguage: "en" as const,
  targetLanguage: "id" as const,
  recentContext: [],
  preferredTerms: {},
};

describe("cloud translation client usage context", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("associates a translation with its private controller and reserved attempt", async () => {
    const controllerToken = "c".repeat(43);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          text: "Kasih karunia",
          usage: { promptTokens: 80, completionTokens: 12, totalTokens: 92 },
        }),
      ),
    );

    await expect(
      new CloudProviderClient().translate(
        request,
        undefined,
        controllerToken,
        7,
      ),
    ).resolves.toMatchObject({ text: "Kasih karunia" });

    const init = vi.mocked(fetch).mock.calls[0][1];
    const headers = new Headers(init?.headers);
    expect(headers.get("x-caption-controller")).toBe(controllerToken);
    expect(headers.get("x-caption-transcription-attempt")).toBe("7");
  });

  it("exposes only normalized quota headroom from a provider error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: "The free AI quota is temporarily exhausted.",
            rateLimit: {
              model: "openai/gpt-oss-20b",
              observedAt: "2026-08-23T08:00:00.000Z",
              requestsPerDay: { limit: 1000, remaining: 0, reset: "8s" },
              tokensPerMinute: { limit: -1, remaining: 0, reset: "secret" },
              privateProviderData: "must be ignored",
            },
          },
          { status: 429 },
        ),
      ),
    );

    const error = await new CloudProviderClient()
      .translate(request)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CloudProviderClientError);
    expect(error).toMatchObject({
      message: "The free AI quota is temporarily exhausted.",
      rateLimit: {
        requestsPerDay: { limit: 1000, remaining: 0, reset: "8s" },
        tokensPerMinute: null,
      },
    });
    expect(JSON.stringify(error)).not.toContain("privateProviderData");
  });

  it("preserves fail-closed usage codes for terminal capture handling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error:
              "Translation completed, but its usage could not be recorded.",
            code: "translation_usage_unavailable",
          },
          { status: 503 },
        ),
      ),
    );

    const error = await new CloudProviderClient()
      .translate(request)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "translation_usage_unavailable",
    });
    expect(isTerminalInferenceControlError(error)).toBe(true);
  });

  it("authenticates transcription attempts and preserves terminal rejection codes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      error: "Transcription attempt already used.", code: "transcription_attempt_used",
    }, { status: 409 })));
    const controllerToken = "c".repeat(43);
    const error = await new CloudProviderClient().transcribe({
      audio: new Blob(["synthetic"], { type: "audio/webm" }),
      sourceLanguage: "id", keywordHints: [],
    }, undefined, controllerToken, 7).catch((caught: unknown) => caught);

    const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
    expect(headers.get("x-caption-controller")).toBe(controllerToken);
    expect(headers.get("x-caption-transcription-attempt")).toBe("7");
    expect(error).toMatchObject({ code: "transcription_attempt_used" });
    expect(isTerminalInferenceControlError(error)).toBe(true);
  });

  it("keeps normalized incomplete usage without accepting partial text or ending capture", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      error: "Incomplete translation skipped.", code: "translation_incomplete",
      text: "Partial output must not be used",
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 1, privateField: "ignored" },
    }, { status: 422 })));
    const error = await new CloudProviderClient().translate(request).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "translation_incomplete",
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
    });
    expect(error).not.toHaveProperty("text");
    expect(JSON.stringify(error)).not.toContain("privateField");
    expect(isTerminalInferenceControlError(error)).toBe(false);
  });
});
