import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

import { viewerDocumentResponse } from "@/live/viewer-document";

async function viewer(hash = `#main.${"t".repeat(43)}`, globals: Record<string, unknown> = {}, acceptLanguage?: string) {
  const elements = new Map<string, ReturnType<typeof element>>();
  function element() {
    return {
      textContent: "", className: "", lang: "", hidden: true,
      dataset: {} as Record<string, string>, value: "standard", style: {} as Record<string, string>,
      getBoundingClientRect: () => ({ top: 0, height: 0 }),
      classList: { add: vi.fn(), toggle: vi.fn() },
      removeAttribute(name: string) { if (name === "lang") this.lang = ""; },
      onchange: () => {}, onclick: () => {},
    };
  }
  const html = await viewerDocumentResponse(new Request("https://caption.example/view", {
    headers: acceptLanguage ? { "accept-language": acceptLanguage } : undefined,
  })).text();
  const document = {
    documentElement: { lang: html.match(/<html lang="([^"]+)"/u)?.[1] ?? "en" },
    querySelector(selector: string) {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector)!;
    },
  };
  const sockets: Socket[] = [];
  const timers: Array<() => void> = [];
  class Socket {
    onmessage: (event: { data: string }) => void = () => {};
    onclose: (event: { code: number }) => void = () => {};
    onopen?: () => void;
    constructor() { sockets.push(this); }
    close() {}
  }
  const location = { hash, protocol: "https:", host: "caption.example", reload: vi.fn() };
  const script = html.match(/<script>([\s\S]*?)<\/script>/u)![1];
  runInNewContext(script, {
    document, location, WebSocket: Socket,
    setTimeout: (callback: () => void) => timers.push(callback),
    ...globals,
  });
  return { document, location, sockets, timers, get: document.querySelector };
}

describe("audience viewer controls and recovery", () => {
  it("keeps English controls separate from caption language and local text sizing", async () => {
    const page = await viewer();
    page.sockets[0].onmessage({ data: JSON.stringify({
      type: "ready", status: "live", caption: {
        sequence: 1, publicText: "Selamat datang", targetLanguage: "id",
        sourceText: "Private source must not appear",
      },
    }) });
    expect(page.get(".caption").textContent).toBe("Selamat datang");
    expect(page.get(".caption").lang).toBe("id");
    expect(page.document.documentElement.lang).toBe("en");
    page.get("#caption-size").value = "extra-large";
    page.get("#caption-size").onchange();
    expect(page.get(".caption").dataset.size).toBe("extra-large");
    page.sockets[0].onmessage({ data: JSON.stringify({ type: "clear" }) });
    expect(page.get(".caption").lang).toBe("");
    expect(page.get(".caption").textContent).toContain("Waiting");
  });

  it("shrinks a long caption until the card fits the viewport and restores the chosen size when it fits", async () => {
    const page = await viewer(undefined, { innerHeight: 600, getComputedStyle: () => ({ fontSize: "52px" }) });
    const caption = page.get(".caption");
    // Card height follows the caption font: 20 lines of text at the current size, below a 100px header.
    page.get(".captionCard").getBoundingClientRect = () => ({ top: 100, height: parseFloat(caption.style.fontSize || "52") * 20 });
    page.sockets[0].onmessage({ data: JSON.stringify({ type: "ready", status: "live", caption: { sequence: 1, publicText: "x".repeat(400), targetLanguage: "en" } }) });
    const shrunk = parseFloat(caption.style.fontSize);
    expect(shrunk).toBeLessThan(52);
    expect(shrunk * 20).toBeLessThanOrEqual(600 - 100 - 16);
    expect(shrunk).toBeGreaterThanOrEqual(18);
    page.get(".captionCard").getBoundingClientRect = () => ({ top: 100, height: 120 });
    page.sockets[0].onmessage({ data: JSON.stringify({ type: "caption", caption: { sequence: 2, publicText: "Short", targetLanguage: "en" } }) });
    expect(caption.style.fontSize).toBe("");
    page.sockets[0].onmessage({ data: JSON.stringify({ type: "clear" }) });
    expect(caption.style.fontSize).toBe("");
  });

  it("shows connection loss immediately and bounds retries even after socket opens", async () => {
    const page = await viewer();
    for (let retry = 0; retry <= 8; retry += 1) {
      const socket = page.sockets.at(-1)!;
      socket.onopen?.();
      socket.onclose({ code: 1006 });
      if (retry < 8) {
        expect(page.get(".status").textContent).toBe("Connection lost · retrying");
        page.timers.shift()!();
      }
    }
    expect(page.sockets).toHaveLength(9);
    expect(page.timers).toHaveLength(0);
    expect(page.get(".status").textContent).toBe("Connection failed");
    expect(page.get("#reconnect").hidden).toBe(false);
    page.get("#reconnect").onclick();
    expect(page.location.reload).toHaveBeenCalledOnce();
  });

  it("never offers reconnection for invalid or revoked links", async () => {
    const invalid = await viewer("");
    expect(invalid.sockets).toHaveLength(0);
    expect(invalid.get(".status").textContent).toBe("Invalid link");
    const revoked = await viewer();
    revoked.sockets[0].onclose({ code: 4003 });
    expect(revoked.get(".status").textContent).toBe("Link replaced");
    expect(revoked.get("#reconnect").hidden).toBe(true);
    expect(revoked.timers).toHaveLength(0);
  });

  it("uses the request Accept-Language for the viewer copy", async () => {
    const response = await viewerDocumentResponse(new Request("https://caption.example/view", {
      headers: { "accept-language": "id-ID,id;q=0.9,en;q=0.8" },
    }));
    const html = await response.text();
    expect(html).toContain('<html lang="id">');
    expect(html).toContain("Ukuran teks");
    const page = await viewer("", {}, "id-ID,id;q=0.9,en;q=0.8");
    expect(page.document.documentElement.lang).toBe("id");
    expect(page.get(".status").textContent).toBe("Tautan tidak valid");
    expect(page.get(".caption").textContent).toBe("Minta operator tautan penonton ponsel yang berlaku.");
  });
});
