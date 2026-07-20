import { afterEach, describe, expect, it, vi } from "vitest";

import {
  handleLiveApiRequest,
  type LiveWorkerEnvironment,
} from "@/live/api";

function environment(response = new Response("{}")) {
  const fetch = vi.fn(async (request: Request) => {
    void request;
    return response;
  });
  const env: LiveWorkerEnvironment = {
    CAPTION_LOCAL_AUTH_BYPASS: "true",
    CAPTION_ROOMS: {
      idFromName: (name) => name,
      get: () => ({ fetch }),
    },
  };
  return { env, fetch };
}

describe("live caption worker API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates a short-lived overlay URL with the token only in the fragment", async () => {
    const { env, fetch } = environment();
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          style: {
            fontSize: 52,
            textColor: "#ffffff",
            backgroundColor: "#101827",
          },
        }),
      }),
      env,
    );

    expect(response?.status).toBe(201);
    const payload = (await response!.json()) as {
      sessionId: string;
      overlayUrl: string;
    };
    const overlayUrl = new URL(payload.overlayUrl);
    expect(overlayUrl.pathname).toBe("/overlay");
    expect(overlayUrl.search).toBe("");
    expect(overlayUrl.hash).toContain(payload.sessionId);
    expect(overlayUrl.hash.split(".")[1]).toHaveLength(43);
    expect(fetch).toHaveBeenCalledOnce();
    const initialization = fetch.mock.calls[0][0] as Request;
    await expect(initialization.json()).resolves.toEqual({
      tokenHash: expect.any(String),
      expiresAt: expect.any(Number),
      style: {
        fontSize: 52,
        textColor: "#ffffff",
        backgroundColor: "#101827",
        backgroundTransparency: 0,
        horizontalMarginPercent: 4,
        verticalMarginPercent: 6,
        horizontalAlign: "center",
        verticalAlign: "bottom",
        fontFamily: "sans-serif",
      },
    });
  });

  it("fails closed when an operator endpoint has no Access configuration", async () => {
    const { env } = environment();
    delete env.CAPTION_LOCAL_AUTH_BYPASS;
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/session", { method: "POST" }),
      env,
    );

    expect(response?.status).toBe(503);
  });

  it("normalizes and forwards live OBS style updates", async () => {
    const { env, fetch } = environment();
    const sessionId = "12345678-1234-4123-8123-123456789abc";
    const response = await handleLiveApiRequest(
      new Request(`https://caption.example/api/live/session/${sessionId}/style`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          style: {
            fontSize: 500,
            backgroundTransparency: 45,
            horizontalMarginPercent: 25,
            verticalMarginPercent: -2,
            horizontalAlign: "right",
            verticalAlign: "middle",
            fontFamily: "serif",
          },
        }),
      }),
      env,
    );

    expect(response?.status).toBe(200);
    const forwarded = fetch.mock.calls[0][0] as Request;
    expect(forwarded.url).toBe("https://caption-room/internal/style");
    await expect(forwarded.json()).resolves.toMatchObject({
      style: {
        fontSize: 72,
        backgroundTransparency: 45,
        horizontalMarginPercent: 20,
        verticalMarginPercent: 0,
        horizontalAlign: "right",
        verticalAlign: "middle",
        fontFamily: "serif",
      },
    });
  });

  it("validates and forwards live session controls", async () => {
    const { env, fetch } = environment(
      new Response(JSON.stringify({ action: "show-test", paused: true, sequence: 4 })),
    );
    const sessionId = "12345678-1234-4123-8123-123456789abc";
    const response = await handleLiveApiRequest(
      new Request(`https://caption.example/api/live/session/${sessionId}/control`, {
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

    expect(response?.status).toBe(200);
    const forwarded = fetch.mock.calls[0][0] as Request;
    expect(forwarded.url).toBe("https://caption-room/internal/control");
    await expect(forwarded.json()).resolves.toMatchObject({
      action: "show-test",
      targetLanguage: "id",
      style: {
        horizontalMarginPercent: 20,
        verticalMarginPercent: 8,
      },
    });
  });

  it("rejects invalid control actions before they reach the room", async () => {
    const { env, fetch } = environment();
    const sessionId = "12345678-1234-4123-8123-123456789abc";
    const response = await handleLiveApiRequest(
      new Request(`https://caption.example/api/live/session/${sessionId}/control`, {
        method: "POST",
        body: JSON.stringify({ action: "rewind" }),
      }),
      env,
    );

    expect(response?.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["pause", "resume", "clear", "show-test"])(
    "fails closed for the %s control without Access configuration",
    async (action) => {
      const { env, fetch } = environment();
      delete env.CAPTION_LOCAL_AUTH_BYPASS;
      const sessionId = "12345678-1234-4123-8123-123456789abc";
      const response = await handleLiveApiRequest(
        new Request(`https://caption.example/api/live/session/${sessionId}/control`, {
          method: "POST",
          body: JSON.stringify({ action, targetLanguage: "en", style: {} }),
        }),
        env,
      );

      expect(response?.status).toBe(503);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("bounds live control request bodies", async () => {
    const { env, fetch } = environment();
    const sessionId = "12345678-1234-4123-8123-123456789abc";
    const response = await handleLiveApiRequest(
      new Request(`https://caption.example/api/live/session/${sessionId}/control`, {
        method: "POST",
        body: JSON.stringify({ action: "clear", padding: "x".repeat(4_097) }),
      }),
      env,
    );

    expect(response?.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects oversized live bodies even without a content-length header", async () => {
    const { env, fetch } = environment();
    const sessionId = "12345678-1234-4123-8123-123456789abc";
    const response = await handleLiveApiRequest(
      new Request(`https://caption.example/api/live/session/${sessionId}/caption`, {
        method: "POST",
        body: JSON.stringify({ publicText: "x".repeat(8_193) }),
      }),
      env,
    );

    expect(response?.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed style JSON instead of silently resetting the style", async () => {
    const { env, fetch } = environment();
    const sessionId = "12345678-1234-4123-8123-123456789abc";
    const response = await handleLiveApiRequest(
      new Request(`https://caption.example/api/live/session/${sessionId}/style`, {
        method: "PUT",
        body: "not-json",
      }),
      env,
    );

    expect(response?.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed public overlay session identifiers", async () => {
    const { env, fetch } = environment();
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/api/live/overlay?session=not-valid", {
        headers: { upgrade: "websocket" },
      }),
      env,
    );

    expect(response?.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves a self-contained overlay without protected Next.js assets", async () => {
    const { env } = environment();
    const response = await handleLiveApiRequest(
      new Request("https://caption.example/overlay"),
      env,
    );
    const html = await response!.text();

    expect(response?.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(html).toContain("new WebSocket");
    expect(html).toContain("Math.max(10,Math.min(72");
    expect(html).toContain("backgroundTransparency");
    expect(html).toContain("horizontalMarginPercent");
    expect(html).toContain("verticalMarginPercent");
    expect(html).toContain('payload.type==="clear"');
    expect(html).toContain("stage.style.alignItems");
    expect(html).toContain('class="captionText"');
    expect(html).toContain("box-decoration-break:clone");
    expect(html).not.toContain("/_next/");
  });
});
