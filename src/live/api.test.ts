import { afterEach, describe, expect, it, vi } from "vitest";

import { encryptOverlayToken } from "@/live/channel-crypto";
import {
  claimTranslationAttempt,
  handleLiveApiRequest,
  recordTranslationUsage,
  type LiveWorkerEnvironment,
} from "@/live/api";

const ENCRYPTION_KEY = "test-observer-channel-key-32-bytes-minimum";

function environment(
  handler?: (request: Request) => Promise<Response> | Response,
) {
  const fetch = vi.fn(
    async (request: Request) => {
      if (handler) return handler(request);
        const url = new URL(request.url);
        if (url.pathname === "/internal/channel" && request.method === "GET") {
          return Response.json({ configured: false, status: "unconfigured" });
        }
        if (url.pathname === "/internal/channel" && request.method === "POST") {
          const body = (await request.clone().json()) as {
            encryptedToken: string;
            style: unknown;
          };
          return Response.json(
            {
              configured: true,
              encryptedToken: body.encryptedToken,
              status: "idle",
              style: body.style,
              startedAt: null,
              expiresAt: null,
            },
            { status: 201 },
          );
        }
        return Response.json({ ok: true });
      },
  );
  const idFromName = vi.fn((name) => name);
  const env: LiveWorkerEnvironment = {
    CAPTION_LOCAL_AUTH_BYPASS: "true",
    OBS_CHANNEL_ENCRYPTION_KEY: ENCRYPTION_KEY,
    CAPTION_ROOMS: {
      idFromName,
      get: () => ({ fetch }),
    },
  };
  return { env, fetch, idFromName };
}

describe("reusable OBS channel worker API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads an unconfigured channel without requiring the encryption secret", async () => {
    const { env, idFromName } = environment();
    delete env.OBS_CHANNEL_ENCRYPTION_KEY;
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/channel"),
      env,
    );

    expect(response?.status).toBe(200);
    await expect(response!.json()).resolves.toMatchObject({
      channelId: "main",
      configured: false,
      status: "unconfigured",
      overlayUrl: null,
      translationRevision: 0,
    });
    expect(idFromName).toHaveBeenCalledWith("channel:main");
  });

  it("creates an encrypted reusable URL with its token only in the fragment", async () => {
    const { env, fetch } = environment();
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/channel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ style: { fontSize: 52 } }),
      }),
      env,
    );

    expect(response?.status).toBe(201);
    const payload = (await response!.json()) as {
      overlayUrl: string;
      translationRevision: number;
    };
    const overlayUrl = new URL(payload.overlayUrl);
    const token = overlayUrl.hash.split(".")[1];
    expect(overlayUrl.pathname).toBe("/overlay");
    expect(overlayUrl.search).toBe("");
    expect(overlayUrl.hash).toMatch(/^#main\./u);
    expect(token).toHaveLength(43);
    expect(payload.translationRevision).toBe(0);

    const initialization = fetch.mock.calls[0][0] as Request;
    const internal = (await initialization.json()) as {
      tokenHash: string;
      encryptedToken: string;
      style: { fontSize: number; horizontalMarginPercent: number };
    };
    expect(internal.tokenHash).toHaveLength(64);
    expect(internal.encryptedToken).not.toContain(token);
    expect(internal.style).toMatchObject({
      fontSize: 52,
      horizontalMarginPercent: 4,
    });
  });

  it("fails closed without Access configuration", async () => {
    const { env, fetch } = environment();
    delete env.CAPTION_LOCAL_AUTH_BYPASS;
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/channel"),
      env,
    );

    expect(response?.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails secret-safely when channel creation has no encryption key", async () => {
    const { env } = environment();
    delete env.OBS_CHANNEL_ENCRYPTION_KEY;
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/channel", {
        method: "POST",
        body: JSON.stringify({ style: {} }),
      }),
      env,
    );

    expect(response?.status).toBe(503);
    const payload = (await response!.json()) as { error: string };
    expect(payload.error).toBe("Reusable OBS channel encryption is unavailable.");
    expect(payload.error).not.toContain(ENCRYPTION_KEY);
  });

  it("decrypts the stored URL only for a protected channel read", async () => {
    const encryptedToken = await encryptOverlayToken("reusable-token", ENCRYPTION_KEY);
    const { env } = environment(async () =>
      Response.json({
        configured: true,
        encryptedToken,
        status: "idle",
        style: {},
        startedAt: null,
        expiresAt: null,
      }),
    );
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/channel"),
      env,
    );
    const payload = (await response!.json()) as {
      overlayUrl: string;
      translationRevision: number;
    };

    expect(payload.overlayUrl).toBe(
      "https://caption.example/overlay#main.reusable-token",
    );
    expect(payload.translationRevision).toBe(0);
  });

  it("starts a service with separate controller and mobile-viewer capabilities", async () => {
    const { env, fetch } = environment(async () =>
      Response.json({
        status: "live",
        startedAt: "2026-08-01T00:00:00.000Z",
        expiresAt: "2026-08-01T01:30:00.000Z",
        translationRevision: 7,
      }),
    );
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/channel/service", {
        method: "POST",
        body: JSON.stringify({ style: {}, takeover: true }),
      }),
      env,
    );
    const payload = (await response!.json()) as {
      controllerToken: string;
      viewerUrl: string;
      translationRevision: number;
    };
    const forwarded = fetch.mock.calls[0][0] as Request;
    const body = (await forwarded.json()) as {
      controllerHash: string;
      viewerTokenHash: string;
      takeover: boolean;
    };
    const viewerUrl = new URL(payload.viewerUrl);
    const viewerToken = viewerUrl.hash.split(".")[1];

    expect(response?.status).toBe(200);
    expect(payload.controllerToken).toHaveLength(43);
    expect(viewerUrl.pathname).toBe("/view");
    expect(viewerUrl.search).toBe("");
    expect(viewerUrl.hash).toMatch(/^#main\./u);
    expect(viewerToken).toHaveLength(43);
    expect(viewerToken).not.toBe(payload.controllerToken);
    expect(body.controllerHash).toHaveLength(64);
    expect(body.viewerTokenHash).toHaveLength(64);
    expect(body.viewerTokenHash).not.toBe(body.controllerHash);
    expect(body.controllerHash).not.toBe(payload.controllerToken);
    expect(body.viewerTokenHash).not.toBe(viewerToken);
    expect(body.takeover).toBe(true);
    expect(payload.translationRevision).toBe(7);
  });

  it("preserves the shared channel style when a start omits a style", async () => {
    const { env, fetch } = environment(async () =>
      Response.json({
        status: "live",
        startedAt: "2026-08-01T00:00:00.000Z",
        expiresAt: "2026-08-01T01:30:00.000Z",
      }),
    );
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/channel/service", {
        method: "POST",
        body: JSON.stringify({ takeover: false }),
      }),
      env,
    );
    const forwarded = fetch.mock.calls[0][0] as Request;
    const body = (await forwarded.json()) as Record<string, unknown>;

    expect(response?.status).toBe(200);
    expect(body).not.toHaveProperty("style");
  });

  it("passes through a channel-in-use conflict without returning a controller", async () => {
    const { env } = environment(async () =>
      Response.json(
        { error: "Already live", code: "channel_in_use" },
        { status: 409 },
      ),
    );
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/channel/service", {
        method: "POST",
        body: JSON.stringify({ style: {} }),
      }),
      env,
    );

    expect(response?.status).toBe(409);
    await expect(response!.json()).resolves.toEqual({
      error: "Already live",
      code: "channel_in_use",
    });
  });

  it("hashes controller headers and normalizes shared style updates", async () => {
    const { env, fetch } = environment();
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/channel/style", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-caption-controller": "controller-secret",
        },
        body: JSON.stringify({
          style: {
            fontSize: 500,
            horizontalMarginPercent: 25,
            verticalMarginPercent: -2,
          },
        }),
      }),
      env,
    );
    const forwarded = fetch.mock.calls[0][0] as Request;
    const body = (await forwarded.json()) as {
      controllerHash: string;
      style: CaptionStyleShape;
    };

    expect(response?.status).toBe(200);
    expect(forwarded.url).toBe("https://caption-room/internal/style");
    expect(body.controllerHash).toHaveLength(64);
    expect(body.controllerHash).not.toContain("controller-secret");
    expect(body.style).toMatchObject({
      fontSize: 72,
      horizontalMarginPercent: 20,
      verticalMarginPercent: 0,
    });
  });

  it("validates a controller lease without forwarding the raw credential", async () => {
    const { env, fetch } = environment(async () =>
      Response.json({
        valid: true,
        status: "live",
        expiresAt: "2026-08-01T01:30:00Z",
        translationRevision: 7,
      }),
    );
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/channel/lease", {
        method: "POST",
        headers: { "x-caption-controller": "controller-secret" },
      }),
      env,
    );
    const forwarded = fetch.mock.calls[0][0] as Request;
    const body = (await forwarded.json()) as { controllerHash: string };

    expect(response?.status).toBe(200);
    expect(forwarded.url).toBe("https://caption-room/internal/lease");
    expect(body.controllerHash).toHaveLength(64);
    expect(body.controllerHash).not.toContain("controller-secret");
    await expect(response!.json()).resolves.toMatchObject({
      translationRevision: 7,
    });
  });

  it("replaces a viewer link through the protected current-controller route", async () => {
    const { env, fetch } = environment(async () =>
      Response.json({ replaced: true, expiresAt: "2026-08-01T01:30:00Z" }),
    );
    const response = await handleLiveApiRequest(
      new Request(
        "https://caption.example/api/live/channel/viewer/rotate",
        {
          method: "POST",
          headers: { "x-caption-controller": "controller-secret" },
        },
      ),
      env,
    );
    const payload = (await response!.json()) as { viewerUrl: string };
    const forwarded = fetch.mock.calls[0][0] as Request;
    const body = (await forwarded.json()) as {
      controllerHash: string;
      viewerTokenHash: string;
    };
    const url = new URL(payload.viewerUrl);
    const token = url.hash.split(".")[1];

    expect(response?.status).toBe(200);
    expect(forwarded.url).toBe("https://caption-room/internal/viewer/rotate");
    expect(body.controllerHash).toHaveLength(64);
    expect(body.viewerTokenHash).toHaveLength(64);
    expect(body.controllerHash).not.toBe(body.viewerTokenHash);
    expect(body.controllerHash).not.toContain("controller-secret");
    expect(url.pathname).toBe("/view");
    expect(url.search).toBe("");
    expect(url.hash).toMatch(/^#main\./u);
    expect(token).toHaveLength(43);
    expect(body.viewerTokenHash).not.toBe(token);
  });

  it("claims one reserved translation attempt with a hashed controller", async () => {
    const { env, fetch } = environment(async () =>
      Response.json({ claimed: true }),
    );
    const controllerToken = "c".repeat(43);

    const response = await claimTranslationAttempt(
      env,
      controllerToken,
      4,
    );

    const forwarded = fetch.mock.calls[0][0] as Request;
    const body = (await forwarded.json()) as {
      controllerHash: string;
      transcriptionAttempt: number;
    };
    expect(response.status).toBe(200);
    expect(forwarded.url).toBe(
      "https://caption-room/internal/translation/claim",
    );
    expect(body).toMatchObject({ transcriptionAttempt: 4 });
    expect(body.controllerHash).toHaveLength(64);
    expect(body.controllerHash).not.toContain(controllerToken);
  });

  it("records server-produced translation usage with a hashed controller", async () => {
    const { env, fetch } = environment(async () =>
      Response.json({ recorded: true }),
    );
    const controllerToken = "c".repeat(43);

    await recordTranslationUsage(env, controllerToken, 4, {
      usage: { promptTokens: 80, completionTokens: 12, totalTokens: 92 },
      rateLimit: {
        model: "openai/gpt-oss-20b",
        observedAt: "2026-08-23T08:00:00.000Z",
        requestsPerDay: { limit: 1000, remaining: 990, reset: "10h" },
        tokensPerMinute: null,
      },
    });

    const forwarded = fetch.mock.calls[0][0] as Request;
    const body = (await forwarded.json()) as {
      controllerHash: string;
      transcriptionAttempt: number;
      usage: { totalTokens: number };
    };
    expect(forwarded.url).toBe("https://caption-room/internal/usage");
    expect(body).toMatchObject({
      transcriptionAttempt: 4,
      usage: { totalTokens: 92 },
    });
    expect(body.controllerHash).toHaveLength(64);
    expect(body.controllerHash).not.toContain(controllerToken);
  });

  it("keeps viewer-link replacement behind Cloudflare Access", async () => {
    const { env, fetch } = environment();
    delete env.CAPTION_LOCAL_AUTH_BYPASS;
    const response = await handleLiveApiRequest(
      new Request(
        "https://caption.example/api/live/channel/viewer/rotate",
        { method: "POST", headers: { "x-caption-controller": "secret" } },
      ),
      env,
    );

    expect(response?.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("validates and forwards idle or paused synthetic controls", async () => {
    const { env, fetch } = environment(async () =>
      Response.json({ action: "show-test", status: "idle", sequence: 4 }),
    );
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/channel/control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "show-test",
          targetLanguage: "id",
          style: { horizontalMarginPercent: 40, verticalMarginPercent: 8 },
        }),
      }),
      env,
    );
    const forwarded = fetch.mock.calls[0][0] as Request;
    const body = (await forwarded.json()) as { style: CaptionStyleShape };

    expect(response?.status).toBe(200);
    expect(body.style).toMatchObject({
      horizontalMarginPercent: 20,
      verticalMarginPercent: 8,
    });
  });

  it("validates and forwards a paused manual caption", async () => {
    const { env, fetch } = environment(async () =>
      Response.json({ action: "manual", status: "paused", sequence: 5 }),
    );
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/channel/control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "manual",
          targetLanguage: "id",
          manualText: "We will resume after the offering.",
        }),
      }),
      env,
    );
    const forwarded = fetch.mock.calls[0][0] as Request;
    const body = (await forwarded.json()) as {
      action: string;
      targetLanguage: string;
      manualText: string;
    };

    expect(response?.status).toBe(200);
    expect(body).toMatchObject({
      action: "manual",
      targetLanguage: "id",
      manualText: "We will resume after the offering.",
    });
  });

  it("rejects a manual control with blank or over-length text before it reaches the room", async () => {
    const { env, fetch } = environment();
    for (const manualText of ["   ", "x".repeat(241)]) {
      const response = await handleLiveApiRequest(
        new Request("https://caption.example/api/live/channel/control", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "manual", targetLanguage: "id", manualText }),
        }),
        env,
      );
      expect(response?.status).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards a controller-authorized translation refresh with its CAS revision", async () => {
    const { env, fetch } = environment(async () =>
      Response.json({
        action: "refresh-translation",
        status: "paused",
        translationRevision: 8,
      }),
    );
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/channel/control", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-caption-controller": "controller-secret",
        },
        body: JSON.stringify({
          action: "refresh-translation",
          expectedTranslationRevision: 7,
          refreshRequestId: "refresh-request-0001",
        }),
      }),
      env,
    );
    const forwarded = fetch.mock.calls[0][0] as Request;
    const body = (await forwarded.json()) as {
      action: string;
      controllerHash: string;
      expectedTranslationRevision: number;
      refreshRequestId: string;
    };

    expect(response?.status).toBe(200);
    expect(forwarded.url).toBe("https://caption-room/internal/control");
    expect(body).toMatchObject({
      action: "refresh-translation",
      expectedTranslationRevision: 7,
      refreshRequestId: "refresh-request-0001",
    });
    expect(body.controllerHash).toHaveLength(64);
    expect(body.controllerHash).not.toContain("controller-secret");
    await expect(response!.json()).resolves.toMatchObject({
      translationRevision: 8,
    });
  });

  it("forwards caption translation revisions without exposing the controller token", async () => {
    const { env, fetch } = environment(async () =>
      Response.json({ published: true, sequence: 4, translationRevision: 7 }),
    );
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/channel/caption", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-caption-controller": "controller-secret",
        },
        body: JSON.stringify({
          publicText: "Selamat datang",
          targetLanguage: "id",
          style: {},
          translationRevision: 7,
        }),
      }),
      env,
    );
    const forwarded = fetch.mock.calls[0][0] as Request;
    const body = (await forwarded.json()) as {
      controllerHash: string;
      translationRevision: number;
    };

    expect(response?.status).toBe(200);
    expect(body.translationRevision).toBe(7);
    expect(body.controllerHash).toHaveLength(64);
    expect(body.controllerHash).not.toContain("controller-secret");
  });

  it.each([
    ["invalid control", "/api/live/channel/control", { action: "rewind" }, 400],
    [
      "refresh without a CAS revision",
      "/api/live/channel/control",
      {
        action: "refresh-translation",
        refreshRequestId: "refresh-request-0001",
      },
      400,
    ],
    [
      "refresh without a request ID",
      "/api/live/channel/control",
      { action: "refresh-translation", expectedTranslationRevision: 1 },
      400,
    ],
    [
      "refresh with an unsafe request ID",
      "/api/live/channel/control",
      {
        action: "refresh-translation",
        expectedTranslationRevision: 1,
        refreshRequestId: "contains spaces",
      },
      400,
    ],
    ["oversized control", "/api/live/channel/control", { action: "clear", padding: "x".repeat(4_097) }, 413],
    ["oversized caption", "/api/live/channel/caption", { publicText: "x".repeat(8_193) }, 413],
  ])("rejects %s before the room", async (_label, path, body, status) => {
    const { env, fetch } = environment();
    const response = await handleLiveApiRequest(
      new Request(`https://caption.example${path}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      env,
    );

    expect(response?.status).toBe(status);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed style JSON instead of resetting shared style", async () => {
    const { env, fetch } = environment();
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/channel/style", {
        method: "PUT",
        body: "not-json",
      }),
      env,
    );

    expect(response?.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed public channel identifiers", async () => {
    const { env, fetch } = environment();
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/overlay?channel=other", {
        headers: { upgrade: "websocket" },
      }),
      env,
    );

    expect(response?.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards only same-origin mobile viewer WebSocket requests", async () => {
    const { env, fetch } = environment(async () => Response.json({ connected: true }));
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/viewer?channel=main", {
        headers: {
          origin: "https://caption.example",
          upgrade: "websocket",
          "sec-websocket-protocol": "church-caption-viewer-v1, viewer-token",
        },
      }),
      env,
    );

    expect(response?.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    const forwarded = fetch.mock.calls[0][0] as Request;
    expect(forwarded.url).toBe(
      "https://caption-room/internal/viewer/connect",
    );
    expect(forwarded.headers.get("origin")).toBe("https://caption.example");
  });

  it.each([
    ["cross-origin", "https://other.example", "main", 403],
    ["missing origin", null, "main", 403],
    ["wrong channel", "https://caption.example", "other", 400],
  ])("rejects %s mobile viewer requests before the room", async (_label, origin, channel, status) => {
    const { env, fetch } = environment();
    const headers = new Headers({ upgrade: "websocket" });
    if (origin) headers.set("origin", origin);
    const response = await handleLiveApiRequest(
      new Request(
        `https://caption.example/api/live/viewer?channel=${channel}`,
        { headers },
      ),
      env,
    );

    expect(response?.status).toBe(status);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves a self-contained hardened mobile viewer without protected assets", async () => {
    const { env, fetch } = environment();
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/view"),
      env,
    );
    const html = await response!.text();

    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(response?.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(response?.headers.get("permissions-policy")).toContain(
      "microphone=()",
    );
    expect(response?.headers.get("x-robots-tag")).toContain("noindex");
    expect(html).toContain("Live translation");
    expect(html).toContain("church-caption-viewer-v1");
    expect(html).toContain("/api/live/viewer?channel=");
    expect(html).toContain("textContent");
    expect(html).toContain("event.code===4002");
    expect(html).toContain("event.code===4003");
    expect(html).not.toContain("church-caption-v1");
    expect(html).not.toContain("/_next/");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves a self-contained persistent overlay without protected assets", async () => {
    const { env } = environment();
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/overlay"),
      env,
    );
    const html = await response!.text();

    expect(response?.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(html).toContain("new WebSocket");
    expect(html).toContain("?channel=");
    expect(html).toContain("attempt>=12");
    expect(html).toContain("backgroundTransparency");
    expect(html).toContain("horizontalMarginPercent");
    expect(html).toContain('payload.type==="clear"');
    expect(html).toContain('captionText.textContent?withTransparency');
    expect(html).toContain('event.code===4001');
    expect(html).not.toContain("/_next/");
    expect(html).not.toContain("connection interrupted");
  });
});

interface CaptionStyleShape {
  fontSize: number;
  horizontalMarginPercent: number;
  verticalMarginPercent: number;
}
