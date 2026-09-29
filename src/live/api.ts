import type { LlmSessionUsage, TranslationResult } from "@/ai/contracts";
import {
  emptyLlmSessionUsage,
  normalizeLlmSessionUsage,
} from "@/ai/usage";
import { CloudAccessError, requireCloudAccess } from "@/auth/cloudflare-access";
import { isLanguageLocale } from "@/domain/languages";
import {
  ChannelEncryptionError,
  decryptOverlayToken,
  encryptOverlayToken,
} from "@/live/channel-crypto";
import { captionTokenHash } from "@/live/caption-room";
import {
  MAIN_CHANNEL_ID,
  MAX_MANUAL_CAPTION_CHARS,
  MAX_TRANSCRIPTION_REQUESTS,
  isLiveSessionControlAction,
  isTranslationRefreshRequestId,
  normalizeCaptionStyle,
  normalizeTranslationRevision,
  type CaptionStyle,
  type ChannelStatus,
  type LiveObserverDetails,
  type LiveSessionControlRequest,
  type ObsChannelDetails,
} from "@/live/contracts";
import { overlayDocumentResponse } from "@/live/overlay-document";
import {
  InvalidRequestBodyError,
  RequestBodyTooLargeError,
  readJsonObject,
} from "@/http/request-body";
import { CAPABILITY_TOKEN_PATTERN, randomToken } from "@/http/tokens";
import { viewerDocumentResponse } from "@/live/viewer-document";
import { operatorIdentityKey } from "@/experience/preferences";
import { json, type ExperienceEnvironment } from "@/experience/contracts";

interface DurableObjectStubLike {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

export interface LiveWorkerEnvironment extends ExperienceEnvironment {
  CAPTION_ROOMS: DurableObjectNamespaceLike;
  CLOUDFLARE_ACCESS_AUD?: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
  CAPTION_LOCAL_AUTH_BYPASS?: string;
  OBS_CHANNEL_ENCRYPTION_KEY?: string;
}

interface InternalChannelDetails {
  serviceId?: string;
  saveHistory?: boolean;
  controllerLabel?: string;
  configured: boolean;
  encryptedToken?: string;
  status: ChannelStatus;
  style?: CaptionStyle;
  startedAt?: number | null;
  expiresAt?: number | null;
  transcriptionRequests?: number;
  llmUsage?: LlmSessionUsage;
  translationRevision?: number;
}

const CONTROLLER_HEADER = "x-caption-controller";

function channelRoom(env: LiveWorkerEnvironment) {
  return env.CAPTION_ROOMS.get(
    env.CAPTION_ROOMS.idFromName(`channel:${MAIN_CHANNEL_ID}`),
  );
}

async function requireOperator(request: Request, env: LiveWorkerEnvironment) {
  return requireCloudAccess(request, {
    audience: env.CLOUDFLARE_ACCESS_AUD,
    teamDomain: env.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
    allowUnconfigured: env.CAPTION_LOCAL_AUTH_BYPASS === "true",
  });
}

/**
 * Authorizes an operator and returns the identity used for per-operator preferences.
 * Without a configured Access application (local development only) every request
 * shares the "local" identity.
 */
export async function authorizeOperatorIdentity(
  request: Request,
  env: LiveWorkerEnvironment,
): Promise<{ denied: Response; identity?: undefined } | { denied?: undefined; identity: string }> {
  try {
    const { email } = await requireOperator(request, env);
    return { identity: email ?? "local" };
  } catch (error) {
    return {
      denied: error instanceof CloudAccessError
        ? json({ error: error.message }, error.status)
        : json({ error: "Cloud AI authorization failed." }, 500),
    };
  }
}

export async function authorizeProtectedAiRequest(
  request: Request,
  env: LiveWorkerEnvironment,
) {
  try {
    await requireOperator(request, env);
    return null;
  } catch (error) {
    return error instanceof CloudAccessError
      ? json({ error: error.message }, error.status)
      : json({ error: "Cloud AI authorization failed." }, 500);
  }
}

async function internalJson<T>(response: Response) {
  return (await response.clone().json()) as T;
}

async function controllerHash(request: Request) {
  const token = request.headers.get(CONTROLLER_HEADER)?.trim();
  return token ? captionTokenHash(token) : undefined;
}

function overlayUrl(request: Request, token: string) {
  const url = new URL("/overlay", request.url);
  url.hash = `${MAIN_CHANNEL_ID}.${token}`;
  return url.toString();
}

function viewerUrl(request: Request, token: string) {
  const url = new URL("/view", request.url);
  url.hash = `${MAIN_CHANNEL_ID}.${token}`;
  return url.toString();
}

function optionalStyle(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidRequestBodyError();
  }
  return normalizeCaptionStyle(value as Partial<CaptionStyle>);
}

async function publicChannelDetails(
  request: Request,
  env: LiveWorkerEnvironment,
  internal: InternalChannelDetails,
): Promise<ObsChannelDetails> {
  if (!internal.configured) {
    return {
      channelId: MAIN_CHANNEL_ID,
      configured: false,
      status: "unconfigured",
      overlayUrl: null,
      style: null,
      startedAt: null,
      expiresAt: null,
      transcriptionRequests: 0,
      llmUsage: emptyLlmSessionUsage(),
      translationRevision: 0,
    };
  }
  if (!internal.encryptedToken) {
    throw new ChannelEncryptionError("The reusable OBS credential is unavailable.");
  }
  const token = await decryptOverlayToken(
    internal.encryptedToken,
    env.OBS_CHANNEL_ENCRYPTION_KEY,
  );
  return {
    channelId: MAIN_CHANNEL_ID,
    configured: true,
    serviceId: internal.serviceId,
    saveHistory: internal.saveHistory,
    controllerLabel: internal.controllerLabel,
    status: internal.status,
    overlayUrl: overlayUrl(request, token),
    style: normalizeCaptionStyle(internal.style ?? {}),
    startedAt:
      typeof internal.startedAt === "number"
        ? new Date(internal.startedAt).toISOString()
        : null,
    expiresAt:
      typeof internal.expiresAt === "number"
        ? new Date(internal.expiresAt).toISOString()
        : null,
    transcriptionRequests: Number.isSafeInteger(internal.transcriptionRequests)
      ? Math.max(0, internal.transcriptionRequests ?? 0)
      : 0,
    llmUsage: normalizeLlmSessionUsage(internal.llmUsage),
    translationRevision: normalizeTranslationRevision(
      internal.translationRevision,
    ),
  };
}

function validInferenceAttemptContext(
  controllerToken: string,
  transcriptionAttempt: number,
) {
  return (
    CAPABILITY_TOKEN_PATTERN.test(controllerToken) &&
    Number.isSafeInteger(transcriptionAttempt) &&
    transcriptionAttempt > 0 &&
    transcriptionAttempt <= MAX_TRANSCRIPTION_REQUESTS
  );
}

export async function claimTranslationAttempt(
  env: LiveWorkerEnvironment,
  controllerToken: string,
  transcriptionAttempt: number,
) {
  return claimInferenceAttempt(env, controllerToken, transcriptionAttempt, "translation");
}

export async function claimTranscriptionAttempt(
  env: LiveWorkerEnvironment,
  controllerToken: string,
  transcriptionAttempt: number,
) {
  return claimInferenceAttempt(env, controllerToken, transcriptionAttempt, "transcription");
}

async function claimInferenceAttempt(
  env: LiveWorkerEnvironment,
  controllerToken: string,
  transcriptionAttempt: number,
  stage: "transcription" | "translation",
) {
  if (!validInferenceAttemptContext(controllerToken, transcriptionAttempt)) {
    return json({
      error: "Inference authentication requires a current controller and reserved attempt. Reload the operator page.",
      code: `invalid_${stage}_attempt`,
    }, 400);
  }
  return channelRoom(env).fetch(
    new Request(`https://caption-room/internal/${stage}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        controllerHash: await captionTokenHash(controllerToken),
        transcriptionAttempt,
      }),
    }),
  );
}

export async function recordTranslationUsage(
  env: LiveWorkerEnvironment,
  controllerToken: string,
  transcriptionAttempt: number,
  result: Pick<TranslationResult, "usage" | "rateLimit">,
) {
  if (!validInferenceAttemptContext(controllerToken, transcriptionAttempt)) {
    return json({ error: "Invalid translation usage record." }, 400);
  }
  return channelRoom(env).fetch(
    new Request("https://caption-room/internal/usage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        controllerHash: await captionTokenHash(controllerToken),
        transcriptionAttempt,
        usage: result.usage,
        rateLimit: result.rateLimit,
      }),
    }),
  );
}

async function getChannel(request: Request, env: LiveWorkerEnvironment) {
  await requireOperator(request, env);
  const response = await channelRoom(env).fetch(
    new Request("https://caption-room/internal/channel"),
  );
  if (!response.ok) return response;
  return json(
    await publicChannelDetails(
      request,
      env,
      await internalJson<InternalChannelDetails>(response),
    ),
  );
}

async function createChannel(request: Request, env: LiveWorkerEnvironment) {
  await requireOperator(request, env);
  const body = (await readJsonObject(request, 4_096)) as { style?: unknown };
  const style = optionalStyle(body.style);
  const token = randomToken();
  const response = await channelRoom(env).fetch(
    new Request("https://caption-room/internal/channel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tokenHash: await captionTokenHash(token),
        encryptedToken: await encryptOverlayToken(
          token,
          env.OBS_CHANNEL_ENCRYPTION_KEY,
        ),
        ...(style ? { style } : {}),
      }),
    }),
  );
  if (!response.ok) return response;
  return json(
    await publicChannelDetails(
      request,
      env,
      await internalJson<InternalChannelDetails>(response),
    ),
    response.status,
  );
}

async function rotateChannel(request: Request, env: LiveWorkerEnvironment) {
  await requireOperator(request, env);
  const token = randomToken();
  const response = await channelRoom(env).fetch(
    new Request("https://caption-room/internal/rotate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tokenHash: await captionTokenHash(token),
        encryptedToken: await encryptOverlayToken(
          token,
          env.OBS_CHANNEL_ENCRYPTION_KEY,
        ),
      }),
    }),
  );
  if (!response.ok) return response;
  return json(
    await publicChannelDetails(
      request,
      env,
      await internalJson<InternalChannelDetails>(response),
    ),
  );
}

async function startService(request: Request, env: LiveWorkerEnvironment) {
  const { email } = await requireOperator(request, env);
  const body = (await readJsonObject(request, 4_096)) as {
    style?: unknown;
    takeover?: unknown;
    saveHistory?: unknown;
  };
  if (body.takeover !== undefined && typeof body.takeover !== "boolean") {
    throw new InvalidRequestBodyError();
  }
  const style = optionalStyle(body.style);
  const controllerToken = randomToken();
  const viewerToken = randomToken();
  const readerToken = randomToken();
  if (body.saveHistory !== undefined && typeof body.saveHistory !== "boolean") throw new InvalidRequestBodyError();
  if (body.saveHistory === true && !env.SERMON_JOURNALS) return json({ error: "Saved history is not configured." }, 503);
  const response = await channelRoom(env).fetch(
    new Request("https://caption-room/internal/service", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        controllerHash: await captionTokenHash(controllerToken),
        // Named so the rest of the workspace can see who holds the microphone.
        controllerLabel: email ?? undefined,
        viewerTokenHash: await captionTokenHash(viewerToken),
        readerHash: await captionTokenHash(readerToken),
        saveHistory: body.saveHistory === true,
        ...(style ? { style } : {}),
        takeover: body.takeover === true,
      }),
    }),
  );
  if (!response.ok) return response;
  const details = await internalJson<{
    serviceId: string;
    saveHistory: boolean;
    status: "live";
    startedAt: string;
    expiresAt: string;
    translationRevision: number;
  }>(response);
  return json({
    channelId: MAIN_CHANNEL_ID,
    controllerToken,
    serviceId: details.serviceId,
    saveHistory: details.saveHistory,
    readerUrl: `${new URL("/read", request.url)}#${details.serviceId}.${readerToken}`,
    viewerUrl: viewerUrl(request, viewerToken),
    startedAt: details.startedAt,
    expiresAt: details.expiresAt,
    translationRevision: normalizeTranslationRevision(
      details.translationRevision,
    ),
  });
}

/**
 * Registers the signed-in workspace operator as a read-only watcher of the
 * running service and returns its own public-caption credential. It never
 * touches the controller or the audience links, so up to
 * `MAX_SERVICE_OBSERVERS` operators of one Access workspace can follow the same
 * service without a takeover.
 */
async function observeService(request: Request, env: LiveWorkerEnvironment) {
  const { email } = await requireOperator(request, env);
  const observerToken = randomToken();
  const response = await channelRoom(env).fetch(
    new Request("https://caption-room/internal/experience/observer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identityKey: await operatorIdentityKey(email ?? "local"),
        observerHash: await captionTokenHash(observerToken),
      }),
    }),
  );
  if (!response.ok) return response;
  const details = await internalJson<{
    serviceId: string;
    saveHistory: boolean;
    controllerLabel?: string;
    status: "live" | "paused";
    startedAt: string;
    expiresAt: string;
    translationRevision: number;
  }>(response);
  return json({
    channelId: MAIN_CHANNEL_ID,
    serviceId: details.serviceId,
    saveHistory: details.saveHistory,
    controllerLabel: details.controllerLabel,
    status: details.status,
    observerToken,
    viewerUrl: viewerUrl(request, observerToken),
    startedAt: details.startedAt,
    expiresAt: details.expiresAt,
    translationRevision: normalizeTranslationRevision(details.translationRevision),
  } satisfies LiveObserverDetails);
}

async function replaceViewerLink(
  request: Request,
  env: LiveWorkerEnvironment,
) {
  await requireOperator(request, env);
  const token = randomToken();
  const response = await channelRoom(env).fetch(
    new Request("https://caption-room/internal/viewer/rotate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        controllerHash: await controllerHash(request),
        viewerTokenHash: await captionTokenHash(token),
      }),
    }),
  );
  if (!response.ok) return response;
  return json({ viewerUrl: viewerUrl(request, token) });
}

async function endService(request: Request, env: LiveWorkerEnvironment) {
  await requireOperator(request, env);
  return channelRoom(env).fetch(
    new Request("https://caption-room/internal/service", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controllerHash: await controllerHash(request) }),
    }),
  );
}

async function publishCaption(request: Request, env: LiveWorkerEnvironment) {
  await requireOperator(request, env);
  const body = await readJsonObject(request, 8_192);
  return channelRoom(env).fetch(
    new Request("https://caption-room/internal/caption", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, controllerHash: await controllerHash(request) }),
    }),
  );
}

async function reserveTranscriptionAttempt(
  request: Request,
  env: LiveWorkerEnvironment,
) {
  await requireOperator(request, env);
  return channelRoom(env).fetch(
    new Request("https://caption-room/internal/lease", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controllerHash: await controllerHash(request) }),
    }),
  );
}

async function updateStyle(request: Request, env: LiveWorkerEnvironment) {
  await requireOperator(request, env);
  const body = (await readJsonObject(request, 4_096)) as { style?: unknown };
  const style = optionalStyle(body.style);
  if (!style) throw new InvalidRequestBodyError();
  return channelRoom(env).fetch(
    new Request("https://caption-room/internal/style", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        style,
        controllerHash: await controllerHash(request),
      }),
    }),
  );
}

async function controlChannel(request: Request, env: LiveWorkerEnvironment) {
  await requireOperator(request, env);
  const body = (await readJsonObject(request, 4_096)) as Partial<
    LiveSessionControlRequest
  >;
  if (!isLiveSessionControlAction(body.action)) {
    throw new InvalidRequestBodyError();
  }
  const control: LiveSessionControlRequest & { controllerHash?: string } = {
    action: body.action,
    controllerHash: await controllerHash(request),
  };
  if (body.action === "show-test") {
    if (!body.targetLanguage || !isLanguageLocale(body.targetLanguage)) {
      throw new InvalidRequestBodyError();
    }
    control.targetLanguage = body.targetLanguage;
    control.style = optionalStyle(body.style);
  } else if (body.action === "manual") {
    if (
      !body.targetLanguage ||
      !isLanguageLocale(body.targetLanguage) ||
      typeof body.manualText !== "string" ||
      !body.manualText.trim() ||
      body.manualText.length > MAX_MANUAL_CAPTION_CHARS
    ) {
      throw new InvalidRequestBodyError();
    }
    control.targetLanguage = body.targetLanguage;
    control.style = optionalStyle(body.style);
    control.manualText = body.manualText;
  } else if (body.action === "refresh-translation") {
    if (
      !Number.isSafeInteger(body.expectedTranslationRevision) ||
      Number(body.expectedTranslationRevision) < 0 ||
      !isTranslationRefreshRequestId(body.refreshRequestId)
    ) {
      throw new InvalidRequestBodyError();
    }
    control.expectedTranslationRevision = body.expectedTranslationRevision;
    control.refreshRequestId = body.refreshRequestId;
  }
  return channelRoom(env).fetch(
    new Request("https://caption-room/internal/control", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(control),
    }),
  );
}

async function connectOverlay(request: Request, env: LiveWorkerEnvironment) {
  return channelRoom(env).fetch(
    new Request("https://caption-room/internal/connect", request),
  );
}

async function connectViewer(request: Request, env: LiveWorkerEnvironment) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return json({ error: "The mobile viewer origin is invalid." }, 403);
  }
  return channelRoom(env).fetch(
    new Request("https://caption-room/internal/viewer/connect", request),
  );
}

function protectedError(error: unknown, operation: string) {
  if (error instanceof RequestBodyTooLargeError) {
    return json({ error: `${operation} is too large.` }, 413);
  }
  if (error instanceof InvalidRequestBodyError) {
    return json({ error: `${operation} is invalid.` }, 400);
  }
  if (error instanceof CloudAccessError) {
    return json({ error: error.message }, error.status);
  }
  if (error instanceof ChannelEncryptionError) {
    return json(
      {
        error: "Reusable OBS channel encryption is unavailable.",
        code: "invalid_overlay_key",
      },
      503,
    );
  }
  return json({ error: `${operation} failed.` }, 500);
}

export async function handleLiveApiRequest(
  request: Request,
  env: LiveWorkerEnvironment,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/overlay" && request.method === "GET") {
    return overlayDocumentResponse();
  }
  if (url.pathname === "/view") {
    return request.method === "GET"
      ? viewerDocumentResponse()
      : json({ error: "Unsupported mobile viewer operation." }, 405);
  }
  if (url.pathname === "/api/live/overlay" && request.method === "GET") {
    return url.searchParams.get("channel") === MAIN_CHANNEL_ID
      ? connectOverlay(request, env)
      : json({ error: "Invalid OBS channel." }, 400);
  }
  if (url.pathname === "/api/live/viewer") {
    if (request.method !== "GET") {
      return json({ error: "Unsupported mobile viewer operation." }, 405);
    }
    return url.searchParams.get("channel") === MAIN_CHANNEL_ID
      ? connectViewer(request, env)
      : json({ error: "Invalid mobile viewer channel." }, 400);
  }

  try {
    if (url.pathname === "/api/live/channel") {
      if (request.method === "GET") return await getChannel(request, env);
      if (request.method === "POST") return await createChannel(request, env);
      return json({ error: "Unsupported OBS channel operation." }, 405);
    }
    if (url.pathname === "/api/live/channel/rotate") {
      return request.method === "POST"
        ? await rotateChannel(request, env)
        : json({ error: "Unsupported OBS channel rotation operation." }, 405);
    }
    if (url.pathname === "/api/live/channel/service") {
      if (request.method === "POST") return await startService(request, env);
      if (request.method === "DELETE") return await endService(request, env);
      return json({ error: "Unsupported live-service operation." }, 405);
    }
    if (url.pathname === "/api/live/channel/observer") {
      return request.method === "POST"
        ? await observeService(request, env)
        : json({ error: "Unsupported live-watcher operation." }, 405);
    }
    if (url.pathname === "/api/live/channel/viewer/rotate") {
      return request.method === "POST"
        ? await replaceViewerLink(request, env)
        : json({ error: "Unsupported mobile viewer-link operation." }, 405);
    }
    if (url.pathname === "/api/live/channel/caption") {
      return request.method === "POST"
        ? await publishCaption(request, env)
        : json({ error: "Unsupported live-caption operation." }, 405);
    }
    if (url.pathname === "/api/live/channel/lease") {
      return request.method === "POST"
        ? await reserveTranscriptionAttempt(request, env)
        : json({ error: "Unsupported controller-lease operation." }, 405);
    }
    if (url.pathname === "/api/live/channel/style") {
      return request.method === "PUT"
        ? await updateStyle(request, env)
        : json({ error: "Unsupported caption-style operation." }, 405);
    }
    if (url.pathname === "/api/live/channel/control") {
      return request.method === "POST"
        ? await controlChannel(request, env)
        : json({ error: "Unsupported live-control operation." }, 405);
    }
    if (url.pathname.startsWith("/api/live/")) {
      return json({ error: "Live route not found." }, 404);
    }
  } catch (error) {
    const label = url.pathname.includes("observer")
      ? "Live watcher"
      : url.pathname.includes("viewer")
      ? "Mobile viewer link"
      : url.pathname.includes("caption")
      ? "Caption event"
      : url.pathname.includes("style")
        ? "Caption style"
        : url.pathname.includes("control")
          ? "Live control"
          : url.pathname.includes("service")
            ? "Live service"
            : "OBS channel operation";
    return protectedError(error, label);
  }
  return null;
}
