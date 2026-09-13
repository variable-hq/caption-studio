import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CloudProviderClient,
  CloudProviderClientError,
  isTerminalInferenceControlError,
} from "@/ai/cloud-provider-client";
import type { InferenceAttemptContext } from "@/ai/contracts";
import { MAX_TRANSCRIPTION_REQUESTS } from "@/live/contracts";

const context: InferenceAttemptContext = {
  controllerToken: "c".repeat(43),
  transcriptionAttempt: 7,
};

const transcriptionRequest = {
  audio: new Blob(["synthetic"], { type: "audio/webm" }),
  sourceLanguage: "en" as const,
  keywordHints: [],
};

const request = {
  text: "Grace",
  sourceLanguage: "en" as const,
  targetLanguage: "id" as const,
  recentContext: [],
  preferredTerms: {},
};

describe("cloud inference client authentication and usage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(["transcribe", "translate"] as const)(
    "blocks %s without authentication before sending a request",
    async (stage) => {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ segments: [], text: "unused" })));
      const client = new CloudProviderClient();
      let result;
      if (stage === "transcribe") {
        // @ts-expect-error Authentication must be required at compile time too.
        result = client.transcribe(transcriptionRequest);
      } else {
        // @ts-expect-error Authentication must be required at compile time too.
        result = client.translate(request);
      }
      const error = await result.catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(CloudProviderClientError);
      expect(error).toMatchObject({ code: `invalid_${stage === "transcribe" ? "transcription" : "translation"}_attempt` });
      expect(isTerminalInferenceControlError(error)).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  describe.each(["transcribe", "translate"] as const)("%s authentication", (stage) => {
    it.each([
      ["missing controller", { transcriptionAttempt: 7 }],
      ["invalid controller", { ...context, controllerToken: "invalid" }],
      ["missing attempt", { controllerToken: context.controllerToken }],
      ["string attempt", { ...context, transcriptionAttempt: "7" }],
      ["zero attempt", { ...context, transcriptionAttempt: 0 }],
      ["fractional attempt", { ...context, transcriptionAttempt: 1.5 }],
      ["over-limit attempt", { ...context, transcriptionAttempt: MAX_TRANSCRIPTION_REQUESTS + 1 }],
    ])("rejects %s without sending audio or text", async (_label, invalidContext) => {
      vi.stubGlobal("fetch", vi.fn());
      const client = new CloudProviderClient();
      const result = stage === "transcribe"
        ? client.transcribe(transcriptionRequest, invalidContext as InferenceAttemptContext)
        : client.translate(request, invalidContext as InferenceAttemptContext);
      const error = await result.catch((caught: unknown) => caught);

      expect(isTerminalInferenceControlError(error)).toBe(true);
      expect((error as Error).message).not.toContain(context.controllerToken);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  it("sends both transcription headers at the service limit and keeps credentials out of the body", async () => {
    const capture = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      segments: [{ text: "Grace", isFinal: true, detectedLanguage: "en" }],
    })));

    await expect(new CloudProviderClient().transcribe(transcriptionRequest, {
      ...context,
      transcriptionAttempt: MAX_TRANSCRIPTION_REQUESTS,
    }, capture.signal)).resolves.toMatchObject([{ text: "Grace" }]);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/ai/transcribe");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-caption-controller")).toBe(context.controllerToken);
    expect(headers.get("x-caption-transcription-attempt")).toBe(String(MAX_TRANSCRIPTION_REQUESTS));
    // Fetch must set the multipart boundary itself.
    expect(headers.has("content-type")).toBe(false);
    const form = init?.body as FormData;
    expect(form.get("audio")).toBeInstanceOf(Blob);
    expect([...form.keys()]).toEqual(["audio", "sourceLanguage", "keywordHints"]);
    capture.abort();
    expect(init?.signal?.aborted).toBe(true);
  });

  it("associates a translation with its private controller and reserved attempt", async () => {
    const capture = new AbortController();
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
        context,
        capture.signal,
      ),
    ).resolves.toMatchObject({ text: "Kasih karunia" });

    const init = vi.mocked(fetch).mock.calls[0][1];
    const headers = new Headers(init?.headers);
    expect(headers.get("x-caption-controller")).toBe(context.controllerToken);
    expect(headers.get("x-caption-transcription-attempt")).toBe("7");
    expect(JSON.parse(init?.body as string)).toEqual(request);
    capture.abort();
    expect(init?.signal?.aborted).toBe(true);
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
      .translate(request, context)
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
      .translate(request, context)
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
    const error = await new CloudProviderClient().transcribe({
      audio: new Blob(["synthetic"], { type: "audio/webm" }),
      sourceLanguage: "id", keywordHints: [],
    }, context).catch((caught: unknown) => caught);

    const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
    expect(headers.get("x-caption-controller")).toBe(context.controllerToken);
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
    const error = await new CloudProviderClient().translate(request, context).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "translation_incomplete",
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
    });
    expect(error).not.toHaveProperty("text");
    expect(JSON.stringify(error)).not.toContain("privateField");
    expect(isTerminalInferenceControlError(error)).toBe(false);
  });
});
