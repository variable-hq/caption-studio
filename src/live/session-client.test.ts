import { afterEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/i18n";
import { LiveSessionClient } from "@/live/session-client";

function failureResponse() {
  return new Response(JSON.stringify({ code: "invalid_overlay_key" }), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LiveSessionClient error fallbacks", () => {
  it("uses the English fallback when the server sends no error text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => failureResponse()));

    await expect(new LiveSessionClient().getChannel()).rejects.toThrow(
      "Could not load the Main OBS channel.",
    );
  });

  it("uses the injected translator for fallbacks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => failureResponse()));

    await expect(
      new LiveSessionClient((key) => translate("id", key)).getChannel(),
    ).rejects.toThrow(translate("id", "request.channelLoad"));
  });

  it("prefers the server error text over the fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Server said no." }), {
            status: 500,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    await expect(
      new LiveSessionClient((key) => translate("id", key)).getChannel(),
    ).rejects.toThrow("Server said no.");
  });
});

describe("LiveSessionClient session error codes", () => {
  it("reads sessionCode when the server sends it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Session paused.", code: "service_paused", sessionCode: "session_paused" }), {
      status: 409, headers: { "content-type": "application/json" },
    })));

    await expect(new LiveSessionClient().observeSession()).rejects.toMatchObject({ code: "session_paused" });
  });

  it("falls back to the earlier code and maps it to its session name", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Session paused.", code: "service_paused" }), {
      status: 409, headers: { "content-type": "application/json" },
    })));

    await expect(new LiveSessionClient().observeSession()).rejects.toMatchObject({ code: "session_paused" });
  });

  it("keeps other codes as they are", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Caption cleared.", code: "caption_cleared" }), {
      status: 409, headers: { "content-type": "application/json" },
    })));

    await expect(new LiveSessionClient().observeSession()).rejects.toMatchObject({ code: "caption_cleared" });
  });
});
