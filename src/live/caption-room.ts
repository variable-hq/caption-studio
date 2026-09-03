import type { LlmSessionUsage, TranslationResult } from "@/ai/contracts";
import {
  accumulateLlmSessionUsage,
  emptyLlmSessionUsage,
  normalizeLlmSessionUsage,
} from "@/ai/usage";
import { isLanguageLocale } from "@/domain/languages";
import {
  MAX_CAPTION_EVENTS,
  MAX_LIVE_SESSION_MS,
  MAX_TRANSCRIPTION_REQUESTS,
  isLiveSessionControlAction,
  isTranslationRefreshRequestId,
  normalizeCaptionStyle,
  normalizeTranslationRevision,
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
  llmUsage: LlmSessionUsage;
  claimedTranslationAttempts: number[];
  recordedTranslationAttempts: number[];
  translationRevision: number;
  lastTranslationRefreshRequestId?: string;
  controllerHash?: string;
  viewerTokenHash?: string;
  startedAt?: number;
  expiresAt?: number;
}

interface StartServiceRequest {
  controllerHash: string;
  viewerTokenHash: string;
  style: CaptionStyle;
  takeover: boolean;
}

interface TranslationAttemptRequest {
  controllerHash: string;
  transcriptionAttempt: number;
}

interface RecordTranslationUsageRequest
  extends TranslationAttemptRequest,
    Pick<TranslationResult, "usage" | "rateLimit"> {}

type MutationResult<T> =
  | { kind: "ok"; value: T; clear?: boolean; revokeViewers?: boolean }
  | { kind: "channel-not-configured" }
  | { kind: "channel-in-use"; expiresAt?: number }
  | { kind: "controller-replaced" }
  | { kind: "transcription-limit" }
  | { kind: "translation-attempt-used" }
  | { kind: "translation-session-refreshed"; translationRevision: number }
  | { kind: "inactive"; clear?: boolean }
  | { kind: "invalid" };

type ViewerStreamEvent =
  | { type: "caption"; caption: PublicCaptionEvent }
  | { type: "clear" }
  | { type: "state"; status: ChannelStatus; expiresAt: string | null };

const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};
const OVERLAY_PROTOCOL = "church-caption-v1";
const VIEWER_PROTOCOL = "church-caption-viewer-v1";
const OVERLAY_SOCKET_TAG = "overlay";
const VIEWER_SOCKET_TAG = "viewer";
const MAX_VIEWER_CONNECTIONS = 250;
const CAPABILITY_TOKEN = /^[A-Za-z0-9_-]{43}$/;

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
    llmUsage: normalizeLlmSessionUsage(configuration.llmUsage),
    claimedTranslationAttempts: Array.isArray(
      configuration.claimedTranslationAttempts,
    )
      ? [
          ...new Set(
            configuration.claimedTranslationAttempts.filter(
              (attempt) =>
                Number.isSafeInteger(attempt) &&
                attempt > 0 &&
                attempt <= MAX_TRANSCRIPTION_REQUESTS,
            ),
          ),
        ].slice(0, MAX_TRANSCRIPTION_REQUESTS)
      : [],
    recordedTranslationAttempts: Array.isArray(
      configuration.recordedTranslationAttempts,
    )
      ? [
          ...new Set(
            configuration.recordedTranslationAttempts.filter(
              (attempt) =>
                Number.isSafeInteger(attempt) &&
                attempt > 0 &&
                attempt <= MAX_TRANSCRIPTION_REQUESTS,
            ),
          ),
        ].slice(0, MAX_TRANSCRIPTION_REQUESTS)
      : [],
    translationRevision: normalizeTranslationRevision(
      configuration.translationRevision,
    ),
  } satisfies ChannelConfiguration;
}

function deactivate(configuration: ChannelConfiguration) {
  const current = normalizeConfiguration(configuration);
  current.status = "idle";
  current.serviceEventCount = 0;
  current.transcriptionRequests = 0;
  current.llmUsage = emptyLlmSessionUsage();
  current.claimedTranslationAttempts = [];
  current.recordedTranslationAttempts = [];
  delete current.controllerHash;
  delete current.viewerTokenHash;
  delete current.startedAt;
  delete current.expiresAt;
  delete current.lastTranslationRefreshRequestId;
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

function websocketToken(request: Request, protocol: string) {
  const protocols = (request.headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!protocols.includes(protocol)) return null;
  const token = protocols.find((value) => value !== protocol) ?? null;
  return token && CAPABILITY_TOKEN.test(token) ? token : null;
}

function validCaptionBody(body: Partial<PublicCaptionRequest>) {
  return (
    typeof body.publicText === "string" &&
    body.publicText.length <= 2_000 &&
    typeof body.targetLanguage === "string" &&
    isLanguageLocale(body.targetLanguage) &&
    Number.isSafeInteger(body.translationRevision) &&
    Number(body.translationRevision) >= 0
  );
}

function validTranslationAttemptBody<
  T extends Partial<TranslationAttemptRequest>,
>(body: T): body is T & TranslationAttemptRequest {
  return (
    typeof body.controllerHash === "string" &&
    body.controllerHash.length === 64 &&
    Number.isSafeInteger(body.transcriptionAttempt) &&
    Number(body.transcriptionAttempt) > 0 &&
    Number(body.transcriptionAttempt) <= MAX_TRANSCRIPTION_REQUESTS
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
    llmUsage: current.llmUsage,
    translationRevision: current.translationRevision,
  };
}

function viewerCaption(caption: PublicCaptionEvent) {
  return {
    sequence: caption.sequence,
    publicText: caption.publicText,
    targetLanguage: caption.targetLanguage,
    publishedAt: caption.publishedAt,
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
    if (
      url.pathname === "/internal/viewer/connect" &&
      request.method === "GET"
    ) {
      return this.connectViewer(request);
    }
    if (
      url.pathname === "/internal/viewer/rotate" &&
      request.method === "POST"
    ) {
      return this.replaceViewerLink(request);
    }
    if (url.pathname === "/internal/service" && request.method === "POST") {
      return this.startService(request);
    }
    if (url.pathname === "/internal/service" && request.method === "DELETE") {
      return this.endService(request);
    }
    if (url.pathname === "/internal/lease" && request.method === "POST") {
      return this.reserveTranscriptionAttempt(request);
    }
    if (
      url.pathname === "/internal/translation/claim" &&
      request.method === "POST"
    ) {
      return this.claimTranslationAttempt(request);
    }
    if (url.pathname === "/internal/usage" && request.method === "POST") {
      return this.recordTranslationUsage(request);
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
          llmUsage: emptyLlmSessionUsage(),
          claimedTranslationAttempts: [],
          recordedTranslationAttempts: [],
          translationRevision: 0,
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

    this.broadcastOverlay({ type: "clear" });
    this.closeViewerSockets(4002, "Live service ended.");
    for (const socket of this.state.getWebSockets(OVERLAY_SOCKET_TAG)) {
      socket.close(4001, "OBS channel link rotated.");
    }
    return json(publicConfiguration(result.value));
  }

  private async connectOverlay(request: Request) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "A WebSocket upgrade is required." }, 426);
    }
    const token = websocketToken(request, OVERLAY_PROTOCOL);
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
    this.state.acceptWebSocket(server, [OVERLAY_SOCKET_TAG]);
    server.serializeAttachment({ role: OVERLAY_SOCKET_TAG });
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

  private async connectViewer(request: Request) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "A WebSocket upgrade is required." }, 426);
    }
    const token = websocketToken(request, VIEWER_PROTOCOL);
    const configuration = await this.expireServiceIfNeeded();
    if (
      !token ||
      !configuration ||
      !isActive(configuration) ||
      !configuration.viewerTokenHash ||
      (await captionTokenHash(token)) !== configuration.viewerTokenHash
    ) {
      return json(
        {
          error: "The mobile viewer link is invalid or expired.",
          code: "invalid_viewer_key",
        },
        401,
      );
    }
    if (
      this.state.getWebSockets(VIEWER_SOCKET_TAG).length >=
      MAX_VIEWER_CONNECTIONS
    ) {
      return json({ error: "The mobile viewer is at capacity." }, 503);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server, [VIEWER_SOCKET_TAG]);
    server.serializeAttachment({ role: VIEWER_SOCKET_TAG });
    const latest = await this.state.storage.get<PublicCaptionEvent>("latest");
    server.send(
      JSON.stringify({
        type: "ready",
        status: configuration.status,
        caption: latest ? viewerCaption(latest) : null,
      }),
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "sec-websocket-protocol": VIEWER_PROTOCOL },
    } as ResponseInit & { webSocket: WebSocket });
  }

  private async startService(request: Request) {
    const body = (await request.json()) as Partial<StartServiceRequest>;
    if (
      typeof body.controllerHash !== "string" ||
      body.controllerHash.length !== 64 ||
      typeof body.viewerTokenHash !== "string" ||
      body.viewerTokenHash.length !== 64 ||
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
      configuration.viewerTokenHash = body.viewerTokenHash!;
      configuration.startedAt = startedAt;
      configuration.expiresAt = startedAt + MAX_LIVE_SESSION_MS;
      configuration.serviceEventCount = 0;
      configuration.transcriptionRequests = 0;
      configuration.llmUsage = emptyLlmSessionUsage();
      configuration.claimedTranslationAttempts = [];
      configuration.recordedTranslationAttempts = [];
      configuration.translationRevision += 1;
      delete configuration.lastTranslationRefreshRequestId;
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
    this.closeViewerSockets(4003, "Mobile viewer link replaced.");
    this.broadcastPublic({ type: "clear" });
    this.broadcastPublic({
      type: "state",
      status: "live",
      expiresAt: new Date(result.value.expiresAt!).toISOString(),
    });
    this.broadcastOverlay({ type: "style", style: result.value.style });
    return json({
      status: result.value.status,
      startedAt: new Date(result.value.startedAt!).toISOString(),
      expiresAt: new Date(result.value.expiresAt!).toISOString(),
      translationRevision: result.value.translationRevision,
    });
  }

  private async replaceViewerLink(request: Request) {
    const body = (await request.json()) as {
      controllerHash?: string;
      viewerTokenHash?: string;
    };
    if (
      typeof body.viewerTokenHash !== "string" ||
      body.viewerTokenHash.length !== 64
    ) {
      return json({ error: "Invalid mobile viewer credential." }, 400);
    }

    const result = await this.state.storage.transaction<
      MutationResult<{ expiresAt: string }>
    >(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { kind: "channel-not-configured" };
      let configuration = normalizeConfiguration(stored);
      const expired = serviceExpired(configuration);
      if (expired) {
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
      configuration.viewerTokenHash = body.viewerTokenHash!;
      await transaction.put("configuration", configuration);
      return {
        kind: "ok",
        value: {
          expiresAt: new Date(configuration.expiresAt!).toISOString(),
        },
      };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind === "inactive") {
      if (result.clear) {
        this.broadcastPublic({ type: "clear" });
        this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
        this.closeViewerSockets(4002, "Live service ended.");
      }
      return json({ error: "The live service is no longer active." }, 410);
    }
    if (result.kind !== "ok") {
      return json({ error: "The mobile viewer link could not be replaced." }, 500);
    }

    this.closeViewerSockets(4003, "Mobile viewer link replaced.");
    return json({ replaced: true, expiresAt: result.value.expiresAt });
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
    this.broadcastPublic({ type: "clear" });
    this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
    this.closeViewerSockets(4002, "Live service ended.");
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
      const expired = serviceExpired(configuration);
      if (expired) {
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
      if (!validCaptionBody(body)) {
        return { kind: "invalid" };
      }
      if (body.translationRevision !== configuration.translationRevision) {
        return {
          kind: "translation-session-refreshed",
          translationRevision: configuration.translationRevision,
        };
      }
      if (configuration.serviceEventCount >= MAX_CAPTION_EVENTS) {
        return { kind: "invalid" };
      }

      const event: PublicCaptionEvent = {
        sequence: configuration.lastSequence + 1,
        publicText: body.publicText!,
        targetLanguage: body.targetLanguage!,
        style: normalizeCaptionStyle(body.style ?? configuration.style),
        translationRevision: body.translationRevision!,
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
    if (result.kind === "translation-session-refreshed") {
      return translationSessionRefreshed(result.translationRevision);
    }
    if (result.kind === "inactive") {
      if (result.clear) {
        this.broadcastPublic({ type: "clear" });
        this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
        this.closeViewerSockets(4002, "Live service ended.");
      }
      return json({ error: "The live service is not accepting captions." }, 410);
    }
    if (result.kind === "invalid") {
      return json({ error: "Invalid public caption or service event limit reached." }, 400);
    }
    if (result.kind !== "ok") {
      return json({ error: "The public caption could not be published." }, 500);
    }

    this.broadcastPublic({ type: "caption", caption: result.value });
    return json({
      published: true,
      sequence: result.value.sequence,
      translationRevision: result.value.translationRevision,
    });
  }

  private async reserveTranscriptionAttempt(request: Request) {
    const body = (await request.json()) as { controllerHash?: string };
    const result = await this.state.storage.transaction<
      MutationResult<{
        status: "live";
        expiresAt: string;
        transcriptionRequests: number;
        translationRevision: number;
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
          translationRevision: configuration.translationRevision,
        },
      };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind === "inactive") {
      if (result.clear) {
        this.broadcastPublic({ type: "clear" });
        this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
        this.closeViewerSockets(4002, "Live service ended.");
      }
      return json({ error: "The live service is no longer active." }, 410);
    }
    if (result.kind === "transcription-limit") {
      return json(
        {
          error: `The ${MAX_TRANSCRIPTION_REQUESTS}-request service limit has been reached.`,
          code: "transcription_limit_reached",
        },
        429,
      );
    }
    if (result.kind !== "ok") {
      return json({ error: "Transcription reservation failed." }, 500);
    }
    return json({ valid: true, ...result.value });
  }

  private async claimTranslationAttempt(request: Request) {
    const body = (await request.json()) as Partial<TranslationAttemptRequest>;
    if (!validTranslationAttemptBody(body)) {
      return json({ error: "Invalid translation attempt." }, 400);
    }
    const transcriptionAttempt = body.transcriptionAttempt;

    const result = await this.state.storage.transaction<MutationResult<null>>(
      async (transaction) => {
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
        if (!isActive(configuration) || configuration.status !== "live") {
          return { kind: "inactive" };
        }
        if (!controllerMatches(configuration, body.controllerHash)) {
          return { kind: "controller-replaced" };
        }
        if (transcriptionAttempt > configuration.transcriptionRequests) {
          return { kind: "invalid" };
        }
        if (
          configuration.claimedTranslationAttempts.includes(
            transcriptionAttempt,
          )
        ) {
          return { kind: "translation-attempt-used" };
        }
        configuration.claimedTranslationAttempts.push(transcriptionAttempt);
        await transaction.put("configuration", configuration);
        return { kind: "ok", value: null };
      },
    );

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind === "inactive") {
      if (result.clear) {
        this.broadcastPublic({ type: "clear" });
        this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
        this.closeViewerSockets(4002, "Live service ended.");
      }
      return json({ error: "The live service is not accepting translations." }, 410);
    }
    if (result.kind === "translation-attempt-used") {
      return json(
        {
          error: "This transcription attempt already requested a translation.",
          code: "translation_attempt_used",
        },
        409,
      );
    }
    if (result.kind === "invalid") {
      return json({ error: "Translation does not match a reserved attempt." }, 400);
    }
    if (result.kind !== "ok") {
      return json({ error: "Translation authorization failed." }, 500);
    }
    return json({ claimed: true });
  }

  private async recordTranslationUsage(request: Request) {
    const body = (await request.json()) as Partial<RecordTranslationUsageRequest>;
    if (!validTranslationAttemptBody(body)) {
      return json({ error: "Invalid translation usage record." }, 400);
    }
    const transcriptionAttempt = body.transcriptionAttempt;

    const result = await this.state.storage.transaction<
      MutationResult<LlmSessionUsage>
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
      if (
        transcriptionAttempt > configuration.transcriptionRequests ||
        !configuration.claimedTranslationAttempts.includes(
          transcriptionAttempt,
        )
      ) {
        return { kind: "invalid" };
      }
      if (configuration.recordedTranslationAttempts.includes(transcriptionAttempt)) {
        return { kind: "ok", value: configuration.llmUsage };
      }

      configuration.llmUsage = accumulateLlmSessionUsage(
        configuration.llmUsage,
        {
          usage: body.usage,
          rateLimit: body.rateLimit,
        },
      );
      configuration.recordedTranslationAttempts.push(transcriptionAttempt);
      await transaction.put("configuration", configuration);
      return { kind: "ok", value: configuration.llmUsage };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind === "inactive") {
      if (result.clear) {
        this.broadcastPublic({ type: "clear" });
        this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
        this.closeViewerSockets(4002, "Live service ended.");
      }
      return json({ error: "The live service is no longer active." }, 410);
    }
    if (result.kind === "invalid") {
      return json({ error: "Translation usage does not match this service." }, 400);
    }
    if (result.kind !== "ok") {
      return json({ error: "Translation usage could not be recorded." }, 500);
    }
    return json({ recorded: true, llmUsage: result.value });
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
      const expired = serviceExpired(configuration);
      if (expired) {
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

      if (action === "refresh-translation") {
        if (!active) {
          return expired
            ? { kind: "inactive", clear: true }
            : { kind: "invalid" };
        }
        if (
          !Number.isSafeInteger(body.expectedTranslationRevision) ||
          Number(body.expectedTranslationRevision) < 0 ||
          !isTranslationRefreshRequestId(body.refreshRequestId)
        ) {
          return { kind: "invalid" };
        }
        const expectedTranslationRevision = Number(
          body.expectedTranslationRevision,
        );
        if (
          expectedTranslationRevision ===
            configuration.translationRevision - 1 &&
          body.refreshRequestId ===
            configuration.lastTranslationRefreshRequestId
        ) {
          return {
            kind: "ok",
            value: {
              action,
              status: configuration.status,
              translationRevision: configuration.translationRevision,
            },
          };
        }
        if (
          expectedTranslationRevision !== configuration.translationRevision
        ) {
          return {
            kind: "translation-session-refreshed",
            translationRevision: configuration.translationRevision,
          };
        }
        configuration.translationRevision += 1;
        configuration.lastTranslationRefreshRequestId = body.refreshRequestId;
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.delete("latest"),
        ]);
        return {
          kind: "ok",
          value: {
            action,
            status: configuration.status,
            translationRevision: configuration.translationRevision,
          },
          clear: true,
        };
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
          translationRevision: configuration.translationRevision,
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
          value: {
            action,
            status: configuration.status,
            translationRevision: configuration.translationRevision,
            sequence: caption.sequence,
            caption,
          },
          revokeViewers: expired,
        };
      }

      if (action === "pause") {
        if (configuration.status !== "live") {
          return expired
            ? { kind: "inactive", clear: true }
            : { kind: "invalid" };
        }
        configuration.status = "paused";
      } else if (action === "resume") {
        if (configuration.status !== "paused") {
          return expired
            ? { kind: "inactive", clear: true }
            : { kind: "invalid" };
        }
        configuration.status = "live";
      }

      await Promise.all([
        transaction.put("configuration", configuration),
        transaction.delete("latest"),
      ]);
      return {
        kind: "ok",
        value: {
          action,
          status: configuration.status,
          translationRevision: configuration.translationRevision,
        },
        clear: true,
        revokeViewers: expired,
      };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind === "translation-session-refreshed") {
      return translationSessionRefreshed(result.translationRevision);
    }
    if (result.kind === "inactive") {
      if (result.clear) {
        this.broadcastPublic({ type: "clear" });
        this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
        this.closeViewerSockets(4002, "Live service ended.");
      }
      return json({ error: "The live service is no longer active." }, 410);
    }
    if (result.kind === "invalid") {
      return json({ error: "The control is not available in the current channel state." }, 409);
    }
    if (result.kind !== "ok") {
      return json({ error: "The live-service control failed." }, 500);
    }

    if (result.clear) this.broadcastPublic({ type: "clear" });
    const caption = result.value.caption;
    if (caption) {
      if (result.value.status === "paused") {
        this.broadcastPublic({ type: "caption", caption });
      } else {
        this.broadcastOverlay({ type: "caption", caption });
      }
    }
    if (action === "pause" || action === "resume") {
      this.broadcastPublic({
        type: "state",
        status: result.value.status,
        expiresAt: null,
      });
    }
    if (result.revokeViewers) {
      this.closeViewerSockets(4002, "Live service ended.");
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
      const expired = serviceExpired(configuration);
      if (expired) configuration = deactivate(configuration);
      if (
        isActive(configuration) &&
        !controllerMatches(configuration, body.controllerHash)
      ) {
        return { kind: "controller-replaced" };
      }
      configuration.style = style;
      const latest = expired
        ? undefined
        : await transaction.get<PublicCaptionEvent>("latest");
      await transaction.put("configuration", configuration);
      if (expired) {
        await transaction.delete("latest");
      } else if (latest) {
        latest.style = style;
        await transaction.put("latest", latest);
      }
      return {
        kind: "ok",
        value: style,
        clear: expired,
        revokeViewers: expired,
      };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind !== "ok") return json({ error: "Caption style update failed." }, 500);
    if (result.clear) {
      this.broadcastPublic({ type: "clear" });
      this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
    }
    if (result.revokeViewers) {
      this.closeViewerSockets(4002, "Live service ended.");
    }
    this.broadcastOverlay({ type: "style", style: result.value });
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
        if (stored.translationRevision !== configuration.translationRevision) {
          await transaction.put("configuration", configuration);
        }
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
      this.broadcastPublic({ type: "clear" });
      this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
      this.closeViewerSockets(4002, "Live service ended.");
    }
    return result.configuration;
  }

  private broadcastOverlay(payload: unknown) {
    const message = JSON.stringify(payload);
    for (const socket of this.state.getWebSockets(OVERLAY_SOCKET_TAG)) {
      try {
        socket.send(message);
      } catch {
        socket.close(1011, "Overlay connection failed.");
      }
    }
  }

  private broadcastViewer(payload: ViewerStreamEvent) {
    const viewerPayload =
      payload.type === "caption"
        ? { type: "caption", caption: viewerCaption(payload.caption) }
        : payload;
    const message = JSON.stringify(viewerPayload);
    for (const socket of this.state.getWebSockets(VIEWER_SOCKET_TAG)) {
      try {
        socket.send(message);
      } catch {
        socket.close(1011, "Mobile viewer connection failed.");
      }
    }
  }

  private broadcastPublic(payload: ViewerStreamEvent) {
    this.broadcastOverlay(payload);
    this.broadcastViewer(payload);
  }

  private closeViewerSockets(code: number, reason: string) {
    for (const socket of this.state.getWebSockets(VIEWER_SOCKET_TAG)) {
      socket.close(code, reason);
    }
  }

  webSocketMessage(socket: WebSocket) {
    const attachment = socket.deserializeAttachment() as
      | { role?: string }
      | null;
    socket.close(
      1008,
      attachment?.role === VIEWER_SOCKET_TAG
        ? "The mobile viewer is read-only."
        : "The OBS overlay is read-only.",
    );
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
    this.broadcastPublic({ type: "clear" });
    this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
    this.closeViewerSockets(4002, "Live service ended.");
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

function translationSessionRefreshed(translationRevision: number) {
  return json(
    {
      error:
        "The translation session was refreshed. Discard this caption and use the current translation settings.",
      code: "translation_session_refreshed",
      translationRevision,
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
