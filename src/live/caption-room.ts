import { isLanguageLocale } from "@/domain/languages";
import {
  MAX_CAPTION_EVENTS,
  MAX_LIVE_SESSION_MS,
  MAX_TRANSCRIPTION_REQUESTS,
  isLiveSessionControlAction,
  normalizeCaptionStyle,
  type CaptionStyle,
  type ChannelStatus,
  type LiveSessionControlRequest,
  type LiveSessionControlResponse,
  type PublicCaptionEvent,
  type PublicCaptionRequest,
} from "@/live/contracts";
import { SAMPLE_CAPTIONS } from "@/live/test-captions";

interface ChannelConfiguration {
  tokenHash: string;
  encryptedToken: string;
  style: CaptionStyle;
  status: Exclude<ChannelStatus, "unconfigured">;
  lastSequence: number;
  serviceEventCount: number;
  transcriptionRequests: number;
  controllerHash?: string;
  startedAt?: number;
  expiresAt?: number;
}

interface StartServiceRequest {
  controllerHash: string;
  style: CaptionStyle;
  takeover: boolean;
}

type MutationResult<T> =
  | { kind: "ok"; value: T; clear?: boolean }
  | { kind: "channel-not-configured" }
  | { kind: "channel-in-use"; expiresAt?: number }
  | { kind: "controller-replaced" }
  | { kind: "transcription-limit" }
  | { kind: "inactive"; clear?: boolean }
  | { kind: "invalid" };

const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};
const OVERLAY_PROTOCOL = "church-caption-v1";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function isActive(configuration: ChannelConfiguration) {
  return configuration.status === "live" || configuration.status === "paused";
}

function normalizeConfiguration(configuration: ChannelConfiguration) {
  return {
    ...configuration,
    style: normalizeCaptionStyle(configuration.style ?? {}),
    status: ["idle", "live", "paused"].includes(configuration.status)
      ? configuration.status
      : "idle",
    lastSequence: Number.isSafeInteger(configuration.lastSequence)
      ? Math.max(0, configuration.lastSequence)
      : 0,
    serviceEventCount: Number.isSafeInteger(configuration.serviceEventCount)
      ? Math.max(0, configuration.serviceEventCount)
      : 0,
    transcriptionRequests: Number.isSafeInteger(configuration.transcriptionRequests)
      ? Math.max(0, configuration.transcriptionRequests)
      : 0,
  } satisfies ChannelConfiguration;
}

function deactivate(configuration: ChannelConfiguration) {
  const current = normalizeConfiguration(configuration);
  current.status = "idle";
  current.serviceEventCount = 0;
  current.transcriptionRequests = 0;
  delete current.controllerHash;
  delete current.startedAt;
  delete current.expiresAt;
  return current;
}

function serviceExpired(configuration: ChannelConfiguration) {
  return (
    isActive(configuration) &&
    typeof configuration.expiresAt === "number" &&
    configuration.expiresAt <= Date.now()
  );
}

function controllerMatches(configuration: ChannelConfiguration, hash: unknown) {
  return (
    typeof hash === "string" &&
    hash.length === 64 &&
    hash === configuration.controllerHash
  );
}

function overlayToken(request: Request) {
  const protocols = (request.headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!protocols.includes(OVERLAY_PROTOCOL)) return null;
  return protocols.find((value) => value !== OVERLAY_PROTOCOL) ?? null;
}

function validCaptionBody(body: Partial<PublicCaptionRequest>) {
  return (
    typeof body.publicText === "string" &&
    body.publicText.length <= 2_000 &&
    typeof body.targetLanguage === "string" &&
    isLanguageLocale(body.targetLanguage)
  );
}

function publicConfiguration(configuration: ChannelConfiguration) {
  const current = normalizeConfiguration(configuration);
  return {
    configured: true,
    encryptedToken: current.encryptedToken,
    status: current.status,
    style: current.style,
    startedAt: current.startedAt ?? null,
    expiresAt: current.expiresAt ?? null,
    lastSequence: current.lastSequence,
    transcriptionRequests: current.transcriptionRequests,
  };
}

export class CaptionRoom {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === "/internal/channel" && request.method === "GET") {
      return this.getChannel();
    }
    if (url.pathname === "/internal/channel" && request.method === "POST") {
      return this.createChannel(request);
    }
    if (url.pathname === "/internal/rotate" && request.method === "POST") {
      return this.rotateChannel(request);
    }
    if (url.pathname === "/internal/connect" && request.method === "GET") {
      return this.connectOverlay(request);
    }
    if (url.pathname === "/internal/service" && request.method === "POST") {
      return this.startService(request);
    }
    if (url.pathname === "/internal/service" && request.method === "DELETE") {
      return this.endService(request);
    }
    if (url.pathname === "/internal/lease" && request.method === "POST") {
      return this.validateLease(request);
    }
    if (url.pathname === "/internal/caption" && request.method === "POST") {
      return this.publishCaption(request);
    }
    if (url.pathname === "/internal/style" && request.method === "POST") {
      return this.updateStyle(request);
    }
    if (url.pathname === "/internal/control" && request.method === "POST") {
      return this.controlService(request);
    }

    return json({ error: "Live-channel route not found." }, 404);
  }

  private async getChannel() {
    const configuration = await this.expireServiceIfNeeded();
    return configuration
      ? json(publicConfiguration(configuration))
      : json({ configured: false, status: "unconfigured" });
  }

  private async createChannel(request: Request) {
    const body = (await request.json()) as Partial<ChannelConfiguration>;
    if (
      typeof body.tokenHash !== "string" ||
      body.tokenHash.length !== 64 ||
      typeof body.encryptedToken !== "string" ||
      !body.encryptedToken
    ) {
      return json({ error: "Invalid OBS channel configuration." }, 400);
    }

    const configuration = await this.state.storage.transaction(
      async (transaction) => {
        const existing = await transaction.get<ChannelConfiguration>("configuration");
        if (existing) return normalizeConfiguration(existing);
        const created: ChannelConfiguration = {
          tokenHash: body.tokenHash!,
          encryptedToken: body.encryptedToken!,
          style: normalizeCaptionStyle(body.style ?? {}),
          status: "idle",
          lastSequence: 0,
          serviceEventCount: 0,
          transcriptionRequests: 0,
        };
        await transaction.put("configuration", created);
        return created;
      },
    );
    return json(publicConfiguration(configuration), 201);
  }

  private async rotateChannel(request: Request) {
    const body = (await request.json()) as Partial<ChannelConfiguration>;
    if (
      typeof body.tokenHash !== "string" ||
      body.tokenHash.length !== 64 ||
      typeof body.encryptedToken !== "string" ||
      !body.encryptedToken
    ) {
      return json({ error: "Invalid OBS channel credential." }, 400);
    }

    const result = await this.state.storage.transaction<
      MutationResult<ChannelConfiguration>
    >(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { kind: "channel-not-configured" };
      let configuration = normalizeConfiguration(stored);
      if (serviceExpired(configuration)) configuration = deactivate(configuration);
      if (isActive(configuration)) {
        return { kind: "channel-in-use", expiresAt: configuration.expiresAt };
      }
      configuration.tokenHash = body.tokenHash!;
      configuration.encryptedToken = body.encryptedToken!;
      await Promise.all([
        transaction.put("configuration", configuration),
        transaction.delete("latest"),
      ]);
      return { kind: "ok", value: configuration, clear: true };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "channel-in-use") return channelInUse(result.expiresAt);
    if (result.kind !== "ok") return json({ error: "OBS channel rotation failed." }, 500);

    this.broadcast({ type: "clear" });
    for (const socket of this.state.getWebSockets("overlay")) {
      socket.close(4001, "OBS channel link rotated.");
    }
    return json(publicConfiguration(result.value));
  }

  private async connectOverlay(request: Request) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "A WebSocket upgrade is required." }, 426);
    }
    const token = overlayToken(request);
    const configuration = await this.expireServiceIfNeeded();
    if (
      !token ||
      !configuration ||
      (await captionTokenHash(token)) !== configuration.tokenHash
    ) {
      return json(
        { error: "The OBS channel link is invalid.", code: "invalid_overlay_key" },
        401,
      );
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server, ["overlay"]);
    server.serializeAttachment({ role: "overlay" });
    const latest = await this.state.storage.get<PublicCaptionEvent>("latest");
    server.send(
      JSON.stringify({
        type: "ready",
        status: configuration.status,
        expiresAt: configuration.expiresAt
          ? new Date(configuration.expiresAt).toISOString()
          : null,
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

  private async startService(request: Request) {
    const body = (await request.json()) as Partial<StartServiceRequest>;
    if (
      typeof body.controllerHash !== "string" ||
      body.controllerHash.length !== 64 ||
      typeof body.takeover !== "boolean"
    ) {
      return json({ error: "Invalid live-service configuration." }, 400);
    }

    const result = await this.state.storage.transaction<
      MutationResult<ChannelConfiguration>
    >(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { kind: "channel-not-configured" };
      let configuration = normalizeConfiguration(stored);
      if (serviceExpired(configuration)) configuration = deactivate(configuration);
      if (isActive(configuration) && !body.takeover) {
        return { kind: "channel-in-use", expiresAt: configuration.expiresAt };
      }

      const startedAt = Date.now();
      configuration.status = "live";
      configuration.controllerHash = body.controllerHash!;
      configuration.startedAt = startedAt;
      configuration.expiresAt = startedAt + MAX_LIVE_SESSION_MS;
      configuration.serviceEventCount = 0;
      configuration.transcriptionRequests = 0;
      configuration.style = normalizeCaptionStyle(body.style ?? configuration.style);
      await Promise.all([
        transaction.put("configuration", configuration),
        transaction.delete("latest"),
      ]);
      return { kind: "ok", value: configuration, clear: true };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "channel-in-use") return channelInUse(result.expiresAt);
    if (result.kind !== "ok") return json({ error: "Live service could not start." }, 500);

    await this.state.storage.setAlarm(result.value.expiresAt!);
    this.broadcast({ type: "clear" });
    this.broadcast({
      type: "state",
      status: "live",
      expiresAt: new Date(result.value.expiresAt!).toISOString(),
    });
    this.broadcast({ type: "style", style: result.value.style });
    return json({
      status: result.value.status,
      startedAt: new Date(result.value.startedAt!).toISOString(),
      expiresAt: new Date(result.value.expiresAt!).toISOString(),
    });
  }

  private async endService(request: Request) {
    const body = (await request.json()) as { controllerHash?: string };
    const result = await this.state.storage.transaction<MutationResult<null>>(
      async (transaction) => {
        const stored = await transaction.get<ChannelConfiguration>("configuration");
        if (!stored) return { kind: "channel-not-configured" };
        let configuration = normalizeConfiguration(stored);
        if (serviceExpired(configuration)) configuration = deactivate(configuration);
        if (!isActive(configuration)) {
          await Promise.all([
            transaction.put("configuration", configuration),
            transaction.delete("latest"),
          ]);
          return { kind: "ok", value: null, clear: true };
        }
        if (!controllerMatches(configuration, body.controllerHash)) {
          return { kind: "controller-replaced" };
        }
        configuration = deactivate(configuration);
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.delete("latest"),
        ]);
        return { kind: "ok", value: null, clear: true };
      },
    );

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    await this.state.storage.deleteAlarm();
    this.broadcast({ type: "clear" });
    this.broadcast({ type: "state", status: "idle", expiresAt: null });
    return new Response(null, { status: 204 });
  }

  private async publishCaption(request: Request) {
    const body = (await request.json()) as Partial<PublicCaptionRequest> & {
      controllerHash?: string;
    };
    const result = await this.state.storage.transaction<
      MutationResult<PublicCaptionEvent>
    >(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { kind: "channel-not-configured" };
      let configuration = normalizeConfiguration(stored);
      if (serviceExpired(configuration)) {
        configuration = deactivate(configuration);
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.delete("latest"),
        ]);
        return { kind: "inactive", clear: true };
      }
      if (!isActive(configuration)) return { kind: "inactive" };
      if (!controllerMatches(configuration, body.controllerHash)) {
        return { kind: "controller-replaced" };
      }
      if (configuration.status !== "live") return { kind: "inactive" };
      if (
        !validCaptionBody(body) ||
        configuration.serviceEventCount >= MAX_CAPTION_EVENTS
      ) {
        return { kind: "invalid" };
      }

      const event: PublicCaptionEvent = {
        sequence: configuration.lastSequence + 1,
        publicText: body.publicText!,
        targetLanguage: body.targetLanguage!,
        style: normalizeCaptionStyle(body.style ?? configuration.style),
        publishedAt: new Date().toISOString(),
      };
      configuration.lastSequence = event.sequence;
      configuration.serviceEventCount += 1;
      configuration.style = event.style;
      await Promise.all([
        transaction.put("configuration", configuration),
        transaction.put("latest", event),
      ]);
      return { kind: "ok", value: event };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind === "inactive") {
      if (result.clear) this.broadcast({ type: "clear" });
      return json({ error: "The live service is not accepting captions." }, 410);
    }
    if (result.kind === "invalid") {
      return json({ error: "Invalid public caption or service event limit reached." }, 400);
    }
    if (result.kind !== "ok") {
      return json({ error: "The public caption could not be published." }, 500);
    }

    this.broadcast({ type: "caption", caption: result.value });
    return json({ published: true, sequence: result.value.sequence });
  }

  private async validateLease(request: Request) {
    const body = (await request.json()) as { controllerHash?: string };
    const result = await this.state.storage.transaction<
      MutationResult<{
        status: "live";
        expiresAt: string;
        transcriptionRequests: number;
      }>
    >(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { kind: "channel-not-configured" };
      let configuration = normalizeConfiguration(stored);
      if (serviceExpired(configuration)) {
        configuration = deactivate(configuration);
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.delete("latest"),
        ]);
        return { kind: "inactive", clear: true };
      }
      if (!isActive(configuration)) return { kind: "inactive" };
      if (!controllerMatches(configuration, body.controllerHash)) {
        return { kind: "controller-replaced" };
      }
      if (configuration.status !== "live") return { kind: "inactive" };
      if (configuration.transcriptionRequests >= MAX_TRANSCRIPTION_REQUESTS) {
        return { kind: "transcription-limit" };
      }
      configuration.transcriptionRequests += 1;
      await transaction.put("configuration", configuration);
      return {
        kind: "ok",
        value: {
          status: "live",
          expiresAt: new Date(configuration.expiresAt!).toISOString(),
          transcriptionRequests: configuration.transcriptionRequests,
        },
      };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind === "inactive") {
      if (result.clear) this.broadcast({ type: "clear" });
      return json({ error: "The live service is no longer active." }, 410);
    }
    if (result.kind === "transcription-limit") {
      return json(
        {
          error: "The 1,350-request service limit has been reached.",
          code: "transcription_limit_reached",
        },
        429,
      );
    }
    if (result.kind !== "ok") return json({ error: "Controller validation failed." }, 500);
    return json({ valid: true, ...result.value });
  }

  private async controlService(request: Request) {
    const body = (await request.json()) as Partial<LiveSessionControlRequest> & {
      controllerHash?: string;
    };
    if (!isLiveSessionControlAction(body.action)) {
      return json({ error: "Invalid live-service control." }, 400);
    }
    const action = body.action;

    const result = await this.state.storage.transaction<
      MutationResult<LiveSessionControlResponse & { caption?: PublicCaptionEvent }>
    >(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { kind: "channel-not-configured" };
      let configuration = normalizeConfiguration(stored);
      if (serviceExpired(configuration)) {
        configuration = deactivate(configuration);
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.delete("latest"),
        ]);
      }

      const active = isActive(configuration);
      if (active && !controllerMatches(configuration, body.controllerHash)) {
        return { kind: "controller-replaced" };
      }

      if (action === "show-test") {
        if (configuration.status === "live") return { kind: "invalid" };
        if (!body.targetLanguage || !isLanguageLocale(body.targetLanguage)) {
          return { kind: "invalid" };
        }
        const style = normalizeCaptionStyle(body.style ?? configuration.style);
        const caption: PublicCaptionEvent = {
          sequence: configuration.lastSequence + 1,
          publicText: SAMPLE_CAPTIONS[body.targetLanguage],
          targetLanguage: body.targetLanguage,
          style,
          publishedAt: new Date().toISOString(),
        };
        configuration.lastSequence = caption.sequence;
        configuration.style = style;
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.put("latest", caption),
        ]);
        return {
          kind: "ok",
          value: { action, status: configuration.status, sequence: caption.sequence, caption },
        };
      }

      if (action === "pause") {
        if (configuration.status !== "live") return { kind: "invalid" };
        configuration.status = "paused";
      } else if (action === "resume") {
        if (configuration.status !== "paused") return { kind: "invalid" };
        configuration.status = "live";
      }

      await Promise.all([
        transaction.put("configuration", configuration),
        transaction.delete("latest"),
      ]);
      return {
        kind: "ok",
        value: { action, status: configuration.status },
        clear: true,
      };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind === "invalid") {
      return json({ error: "The control is not available in the current channel state." }, 409);
    }
    if (result.kind !== "ok") {
      return json({ error: "The live-service control failed." }, 500);
    }

    if (result.clear) this.broadcast({ type: "clear" });
    const caption = result.value.caption;
    if (caption) this.broadcast({ type: "caption", caption });
    if (action === "pause" || action === "resume") {
      this.broadcast({
        type: "state",
        status: result.value.status,
        expiresAt: null,
      });
    }
    const { caption: omitted, ...response } = result.value;
    void omitted;
    return json(response);
  }

  private async updateStyle(request: Request) {
    const body = (await request.json()) as {
      style?: Partial<CaptionStyle>;
      controllerHash?: string;
    };
    const style = normalizeCaptionStyle(body.style ?? {});
    const result = await this.state.storage.transaction<
      MutationResult<CaptionStyle>
    >(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { kind: "channel-not-configured" };
      let configuration = normalizeConfiguration(stored);
      if (serviceExpired(configuration)) configuration = deactivate(configuration);
      if (isActive(configuration) && !controllerMatches(configuration, body.controllerHash)) {
        return { kind: "controller-replaced" };
      }
      configuration.style = style;
      const latest = await transaction.get<PublicCaptionEvent>("latest");
      await transaction.put("configuration", configuration);
      if (latest) {
        latest.style = style;
        await transaction.put("latest", latest);
      }
      return { kind: "ok", value: style };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind !== "ok") return json({ error: "Caption style update failed." }, 500);
    this.broadcast({ type: "style", style: result.value });
    return json({ updated: true, style: result.value });
  }

  private async expireServiceIfNeeded() {
    const result = await this.state.storage.transaction<{
      configuration?: ChannelConfiguration;
      expired: boolean;
    }>(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { expired: false };
      let configuration = normalizeConfiguration(stored);
      if (!serviceExpired(configuration)) {
        return { configuration, expired: false };
      }
      configuration = deactivate(configuration);
      await Promise.all([
        transaction.put("configuration", configuration),
        transaction.delete("latest"),
      ]);
      return { configuration, expired: true };
    });
    if (result.expired) {
      this.broadcast({ type: "clear" });
      this.broadcast({ type: "state", status: "idle", expiresAt: null });
    }
    return result.configuration;
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
    const configuration = await this.state.storage.get<ChannelConfiguration>(
      "configuration",
    );
    if (!configuration || !isActive(configuration)) return;
    await Promise.all([
      this.state.storage.put("configuration", deactivate(configuration)),
      this.state.storage.delete("latest"),
    ]);
    this.broadcast({ type: "clear" });
    this.broadcast({ type: "state", status: "idle", expiresAt: null });
  }
}

function channelNotConfigured() {
  return json(
    { error: "Create the Main OBS channel first.", code: "channel_not_configured" },
    404,
  );
}

function channelInUse(expiresAt?: number) {
  return json(
    {
      error: "The Main channel is already controlled by another operator.",
      code: "channel_in_use",
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    },
    409,
  );
}

function controllerReplaced() {
  return json(
    {
      error: "Control of the Main channel moved to another operator.",
      code: "controller_replaced",
    },
    409,
  );
}

export async function captionTokenHash(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
