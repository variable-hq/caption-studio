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
        horizontalAlign: "right",
        verticalAlign: "middle",
        fontFamily: "serif",
      },
    });
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
    expect(html).toContain("stage.style.alignItems");
    expect(html).toContain('class="captionText"');
    expect(html).toContain("box-decoration-break:clone");
    expect(html).not.toContain("/_next/");
  });
});
