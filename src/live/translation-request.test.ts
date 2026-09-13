import { describe, expect, it, vi } from "vitest";

import type { LiveWorkerEnvironment } from "@/live/api";
import { handleTranslationRequest } from "@/live/translation-request";

function environment(handler: (request: Request) => Promise<Response> | Response) {
  const fetch = vi.fn(async (request: Request) => handler(request));
  const env: LiveWorkerEnvironment = {
    CAPTION_ROOMS: {
      idFromName: () => "main-room",
      get: () => ({ fetch }),
    },
    CAPTION_LOCAL_AUTH_BYPASS: "true",
  };
  return { env, fetch };
}

function translationRequest() {
  return new Request("https://caption.example/api/ai/translate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-caption-controller": "c".repeat(43),
      "x-caption-transcription-attempt": "7",
    },
    body: JSON.stringify({ text: "Grace" }),
  });
}

describe("translation usage control", () => {
  it("authenticates Access before claiming a translation attempt", async () => {
    const { env, fetch } = environment(() =>
      Response.json({ claimed: true }),
    );
    delete env.CAPTION_LOCAL_AUTH_BYPASS;
    const invokeProvider = vi.fn(async () => Response.json({ text: "unused" }));

    const response = await handleTranslationRequest(
      translationRequest(),
      env,
      invokeProvider,
    );

    expect(response.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(invokeProvider).not.toHaveBeenCalled();
  });

  it("claims before provider work and waits for durable usage before responding", async () => {
    const events: string[] = [];
    let releaseUsage!: (response: Response) => void;
    const usageGate = new Promise<Response>((resolve) => {
      releaseUsage = resolve;
    });
    const { env } = environment((request) => {
      const path = new URL(request.url).pathname;
      if (path === "/internal/translation/claim") {
        events.push("claim");
        return Response.json({ claimed: true });
      }
      events.push("usage");
      return usageGate;
    });
    let settled = false;

    const pending = handleTranslationRequest(
      translationRequest(),
      env,
      async () => {
        events.push("provider");
        return Response.json({
          text: "Kasih karunia",
          usage: { promptTokens: 80, completionTokens: 12, totalTokens: 92 },
        });
      },
    ).then((response) => {
      settled = true;
      return response;
    });

    await vi.waitFor(() => expect(events).toEqual(["claim", "provider", "usage"]));
    expect(settled).toBe(false);
    releaseUsage(Response.json({ recorded: true }));
    const response = await pending;

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      text: "Kasih karunia",
    });
  });

  it("blocks duplicate attempts before invoking the provider", async () => {
    const { env } = environment(() =>
      Response.json(
        { error: "Translation attempt already used." },
        { status: 409 },
      ),
    );
    const invokeProvider = vi.fn(async () => Response.json({ text: "unused" }));

    const response = await handleTranslationRequest(
      translationRequest(),
      env,
      invokeProvider,
    );

    expect(response.status).toBe(409);
    expect(invokeProvider).not.toHaveBeenCalled();
  });

  it.each([
    { text: "Unfinished private output", incomplete: true },
    { text: "  " },
  ])("records incomplete work before rejecting publication: %j", async (output) => {
    const events: string[] = [];
    const { env } = environment((request) => {
      events.push(new URL(request.url).pathname);
      return Response.json({ recorded: true });
    });
    const response = await handleTranslationRequest(translationRequest(), env, async () => {
      events.push("provider");
      return Response.json({
        ...output,
        usage: { promptTokens: 10, completionTokens: 2, totalTokens: 1, privateField: "ignored" },
      });
    });

    expect(events).toEqual(["/internal/translation/claim", "provider", "/internal/usage"]);
    expect(response.status).toBe(422);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = await response.json();
    expect(payload).toMatchObject({
      code: "translation_incomplete",
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
    });
    expect(payload).not.toHaveProperty("text");
    expect(payload).not.toHaveProperty("usage.privateField");
  });

  it("fails closed when successful provider usage cannot be persisted", async () => {
    const { env } = environment((request) =>
      new URL(request.url).pathname === "/internal/translation/claim"
        ? Response.json({ claimed: true })
        : Response.json({ error: "Storage unavailable." }, { status: 500 }),
    );

    const response = await handleTranslationRequest(
      translationRequest(),
      env,
      async () =>
        Response.json({
          text: "Kasih karunia",
          usage: { promptTokens: 80, completionTokens: 12, totalTokens: 92 },
        }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "translation_usage_unavailable",
    });
  });

  it.each([
    ["missing", undefined],
    ["malformed", { promptTokens: "80", completionTokens: null }],
  ])("fails closed when provider usage is %s", async (_label, usage) => {
    const { env, fetch } = environment(() => Response.json({ claimed: true }));

    const response = await handleTranslationRequest(
      translationRequest(),
      env,
      async () => Response.json({ text: "Kasih karunia", usage }),
    );

    expect(response.status).toBe(503);
    expect(fetch).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({
      code: "translation_usage_unavailable",
    });
  });
});
