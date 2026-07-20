import { isLanguageLocale } from "@/domain/languages";
import {
  MAX_CAPTION_EVENTS,
  isLiveSessionControlAction,
  normalizeCaptionStyle,
  type CaptionStyle,
  type LiveSessionControlRequest,
  type LiveSessionControlResponse,
  type PublicCaptionEvent,
} from "@/live/contracts";
import { SAMPLE_CAPTIONS } from "@/live/test-captions";

interface RoomConfiguration {
  tokenHash: string;
  expiresAt: number;
  style: CaptionStyle;
  paused: boolean;
  lastSequence: number;
}

type CaptionMutationResult =
  | { kind: "caption"; event: PublicCaptionEvent }
  | { kind: "expired" }
  | { kind: "invalid" }
  | { kind: "paused" };

type ControlMutationResult =
  | {
      kind: "control";
      response: LiveSessionControlResponse;
      caption?: PublicCaptionEvent;
      clear: boolean;
    }
  | { kind: "expired" }
  | { kind: "invalid" }
  | { kind: "not-paused" };

type StyleMutationResult =
  | { kind: "style"; style: CaptionStyle }
  | { kind: "expired" };

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

function normalizedConfiguration(
  configuration: RoomConfiguration,
  latest?: PublicCaptionEvent,
): RoomConfiguration {
  return {
    ...configuration,
    style: normalizeCaptionStyle(configuration.style ?? {}),
    paused: configuration.paused === true,
    lastSequence: Math.max(
      Number.isInteger(configuration.lastSequence) ? configuration.lastSequence : 0,
      latest?.sequence ?? 0,
    ),
  };
}

function validCaptionBody(body: Partial<PublicCaptionEvent>, lastSequence: number) {
  return (
    Number.isInteger(body.sequence) &&
    body.sequence! > lastSequence &&
    body.sequence! <= MAX_CAPTION_EVENTS &&
    typeof body.publicText === "string" &&
    body.publicText.length <= 2_000 &&
    typeof body.targetLanguage === "string" &&
    isLanguageLocale(body.targetLanguage)
  );
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
        paused: false,
        lastSequence: 0,
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

    if (url.pathname === "/internal/control" && request.method === "POST") {
      return this.controlSession(request);
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
    const current = normalizedConfiguration(configuration, latest);
    server.send(
      JSON.stringify({
        type: "ready",
        expiresAt: new Date(current.expiresAt).toISOString(),
        caption: latest ?? null,
        style: latest?.style ?? current.style,
      }),
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "sec-websocket-protocol": OVERLAY_PROTOCOL },
    } as ResponseInit & { webSocket: WebSocket });
  }

  private async publishCaption(request: Request) {
    const body = (await request.json()) as Partial<PublicCaptionEvent>;
    const result = await this.state.storage.transaction<CaptionMutationResult>(
      async (transaction) => {
        const [storedConfiguration, latest] = await Promise.all([
          transaction.get<RoomConfiguration>("configuration"),
          transaction.get<PublicCaptionEvent>("latest"),
        ]);
        if (!storedConfiguration || storedConfiguration.expiresAt <= Date.now()) {
          return { kind: "expired" };
        }
        const configuration = normalizedConfiguration(storedConfiguration, latest);
        if (configuration.paused) return { kind: "paused" };
        if (!validCaptionBody(body, configuration.lastSequence)) {
          return { kind: "invalid" };
        }

        const event: PublicCaptionEvent = {
          sequence: body.sequence!,
          publicText: body.publicText!,
          targetLanguage: body.targetLanguage!,
          style: normalizeCaptionStyle(body.style ?? configuration.style),
          publishedAt: new Date().toISOString(),
        };
        configuration.lastSequence = event.sequence;
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.put("latest", event),
        ]);
        return { kind: "caption", event };
      },
    );

    if (result.kind === "expired") {
      await this.clearRoom("Caption session expired.");
      return json({ error: "The caption session has expired." }, 410);
    }
    if (result.kind === "paused") {
      return json({ error: "The caption session is paused." }, 409);
    }
    if (result.kind === "invalid") {
      return json({ error: "Invalid or out-of-order public caption." }, 400);
    }

    this.broadcast({ type: "caption", caption: result.event });
    return json({ published: true, sequence: result.event.sequence });
  }

  private async controlSession(request: Request) {
    const body = (await request.json()) as Partial<LiveSessionControlRequest>;
    if (!isLiveSessionControlAction(body.action)) {
      return json({ error: "Invalid live-session control." }, 400);
    }
    const action = body.action;

    const result = await this.state.storage.transaction<ControlMutationResult>(
      async (transaction) => {
        const [storedConfiguration, latest] = await Promise.all([
          transaction.get<RoomConfiguration>("configuration"),
          transaction.get<PublicCaptionEvent>("latest"),
        ]);
        if (!storedConfiguration || storedConfiguration.expiresAt <= Date.now()) {
          return { kind: "expired" };
        }
        const configuration = normalizedConfiguration(storedConfiguration, latest);

        if (action === "show-test") {
          if (!configuration.paused) return { kind: "not-paused" };
          if (
            !body.targetLanguage ||
            !isLanguageLocale(body.targetLanguage) ||
            configuration.lastSequence >= MAX_CAPTION_EVENTS
          ) {
            return { kind: "invalid" };
          }
          const event: PublicCaptionEvent = {
            sequence: configuration.lastSequence + 1,
            publicText: SAMPLE_CAPTIONS[body.targetLanguage],
            targetLanguage: body.targetLanguage,
            style: normalizeCaptionStyle(body.style ?? configuration.style),
            publishedAt: new Date().toISOString(),
          };
          configuration.lastSequence = event.sequence;
          await Promise.all([
            transaction.put("configuration", configuration),
            transaction.put("latest", event),
          ]);
          return {
            kind: "control",
            response: {
              action,
              paused: true,
              sequence: event.sequence,
            },
            caption: event,
            clear: false,
          };
        }

        if (action === "pause") configuration.paused = true;
        if (action === "resume") configuration.paused = false;
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.delete("latest"),
        ]);
        return {
          kind: "control",
          response: { action, paused: configuration.paused },
          clear: true,
        };
      },
    );

    if (result.kind === "expired") {
      await this.clearRoom("Caption session expired.");
      return json({ error: "The caption session has expired." }, 410);
    }
    if (result.kind === "not-paused") {
      return json({ error: "Pause the caption session before showing a test." }, 409);
    }
    if (result.kind === "invalid") {
      return json({ error: "Invalid live-session control." }, 400);
    }

    if (result.clear) this.broadcast({ type: "clear" });
    if (result.caption) this.broadcast({ type: "caption", caption: result.caption });
    return json(result.response);
  }

  private async updateStyle(request: Request) {
    const body = (await request.json()) as { style?: Partial<CaptionStyle> };
    const style = normalizeCaptionStyle(body.style ?? {});
    const result = await this.state.storage.transaction<StyleMutationResult>(
      async (transaction) => {
        const [storedConfiguration, latest] = await Promise.all([
          transaction.get<RoomConfiguration>("configuration"),
          transaction.get<PublicCaptionEvent>("latest"),
        ]);
        if (!storedConfiguration || storedConfiguration.expiresAt <= Date.now()) {
          return { kind: "expired" };
        }
        const configuration = normalizedConfiguration(storedConfiguration, latest);
        configuration.style = style;
        await transaction.put("configuration", configuration);
        if (latest) {
          latest.style = style;
          await transaction.put("latest", latest);
        }
        return { kind: "style", style };
      },
    );

    if (result.kind === "expired") {
      await this.clearRoom("Caption session expired.");
      return json({ error: "The caption session has expired." }, 410);
    }

    this.broadcast({ type: "style", style: result.style });
    return json({ updated: true, style: result.style });
  }

  private broadcast(payload: unknown) {
    const message = JSON.stringify(payload);
    for (const socket of this.state.getWebSockets("overlay")) {
      try {
        socket.send(message);
      } catch {
        socket.close(1011, "Overlay connection failed.");
      }
    }
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
