import {
  MAX_CAPTION_EVENTS,
  normalizeCaptionStyle,
  type CaptionStyle,
  type PublicCaptionEvent,
} from "@/live/contracts";
import { isLanguageLocale } from "@/domain/languages";

interface RoomConfiguration {
  tokenHash: string;
  expiresAt: number;
  style: CaptionStyle;
}

const JSON_HEADERS = { "content-type": "application/json" };
const OVERLAY_PROTOCOL = "church-caption-v1";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function overlayToken(request: Request) {
  const protocols = (request.headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!protocols.includes(OVERLAY_PROTOCOL)) return null;
  return protocols.find((value) => value !== OVERLAY_PROTOCOL) ?? null;
}

export class CaptionRoom {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === "/internal/initialize" && request.method === "POST") {
      const body = (await request.json()) as Partial<RoomConfiguration>;
      if (
        !body.tokenHash ||
        typeof body.expiresAt !== "number" ||
        body.expiresAt <= Date.now()
      ) {
        return json({ error: "Invalid live-session configuration." }, 400);
      }
      const configuration: RoomConfiguration = {
        tokenHash: body.tokenHash,
        expiresAt: body.expiresAt,
        style: normalizeCaptionStyle(body.style ?? {}),
      };
      await this.state.storage.put("configuration", configuration);
      await this.state.storage.setAlarm(configuration.expiresAt);
      return json({ ready: true });
    }

    if (url.pathname === "/internal/connect" && request.method === "GET") {
      return this.connectOverlay(request);
    }

    if (url.pathname === "/internal/caption" && request.method === "POST") {
      return this.publishCaption(request);
    }

    if (url.pathname === "/internal/style" && request.method === "POST") {
      return this.updateStyle(request);
    }

    if (url.pathname === "/internal/session" && request.method === "DELETE") {
      await this.clearRoom("Caption session ended.");
      return new Response(null, { status: 204 });
    }

    return json({ error: "Live-session route not found." }, 404);
  }

  private async connectOverlay(request: Request) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "A WebSocket upgrade is required." }, 426);
    }
    const token = overlayToken(request);
    const configuration = await this.state.storage.get<RoomConfiguration>(
      "configuration",
    );
    if (
      !token ||
      !configuration ||
      configuration.expiresAt <= Date.now() ||
      (await hashToken(token)) !== configuration.tokenHash
    ) {
      return json({ error: "The OBS overlay link is invalid or expired." }, 401);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server, ["overlay"]);
    server.serializeAttachment({ role: "overlay" });

    const latest = await this.state.storage.get<PublicCaptionEvent>("latest");
    server.send(
      JSON.stringify({
        type: "ready",
        expiresAt: new Date(configuration.expiresAt).toISOString(),
        caption: latest ?? null,
        style: latest?.style ?? configuration.style,
      }),
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "sec-websocket-protocol": OVERLAY_PROTOCOL },
    } as ResponseInit & { webSocket: WebSocket });
  }

  private async publishCaption(request: Request) {
    const configuration = await this.state.storage.get<RoomConfiguration>(
      "configuration",
    );
    if (!configuration || configuration.expiresAt <= Date.now()) {
      await this.clearRoom("Caption session expired.");
      return json({ error: "The caption session has expired." }, 410);
    }

    const body = (await request.json()) as Partial<PublicCaptionEvent>;
    const previous = await this.state.storage.get<PublicCaptionEvent>("latest");
    if (
      !Number.isInteger(body.sequence) ||
      body.sequence! <= (previous?.sequence ?? 0) ||
      body.sequence! > MAX_CAPTION_EVENTS ||
      typeof body.publicText !== "string" ||
      body.publicText.length > 2_000 ||
      typeof body.targetLanguage !== "string" ||
      !isLanguageLocale(body.targetLanguage)
    ) {
      return json({ error: "Invalid or out-of-order public caption." }, 400);
    }

    const event: PublicCaptionEvent = {
      sequence: body.sequence!,
      publicText: body.publicText,
      targetLanguage: body.targetLanguage,
      style: normalizeCaptionStyle(body.style ?? configuration.style),
      publishedAt: new Date().toISOString(),
    };
    await this.state.storage.put("latest", event);

    const payload = JSON.stringify({ type: "caption", caption: event });
    for (const socket of this.state.getWebSockets("overlay")) {
      try {
        socket.send(payload);
      } catch {
        socket.close(1011, "Overlay connection failed.");
      }
    }
    return json({ published: true, sequence: event.sequence });
  }

  private async updateStyle(request: Request) {
    const configuration = await this.state.storage.get<RoomConfiguration>(
      "configuration",
    );
    if (!configuration || configuration.expiresAt <= Date.now()) {
      await this.clearRoom("Caption session expired.");
      return json({ error: "The caption session has expired." }, 410);
    }

    const body = (await request.json()) as { style?: Partial<CaptionStyle> };
    const style = normalizeCaptionStyle(body.style ?? {});
    configuration.style = style;
    await this.state.storage.put("configuration", configuration);

    const latest = await this.state.storage.get<PublicCaptionEvent>("latest");
    if (latest) {
      latest.style = style;
      await this.state.storage.put("latest", latest);
    }

    const payload = JSON.stringify({ type: "style", style });
    for (const socket of this.state.getWebSockets("overlay")) {
      try {
        socket.send(payload);
      } catch {
        socket.close(1011, "Overlay connection failed.");
      }
    }
    return json({ updated: true, style });
  }

  webSocketMessage(socket: WebSocket) {
    socket.close(1008, "The OBS overlay is read-only.");
  }

  async alarm() {
    await this.clearRoom("Caption session expired.");
  }

  private async clearRoom(reason: string) {
    for (const socket of this.state.getWebSockets()) {
      socket.close(1000, reason);
    }
    await this.state.storage.deleteAll();
  }
}

export async function captionTokenHash(token: string) {
  return hashToken(token);
}
