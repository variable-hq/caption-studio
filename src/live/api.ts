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
  isLiveSessionControlAction,
  isTranslationRefreshRequestId,
  normalizeCaptionStyle,
  normalizeTranslationRevision,
  type CaptionStyle,
  type ChannelStatus,
  type LiveSessionControlRequest,
  type ObsChannelDetails,
} from "@/live/contracts";
import { overlayDocumentResponse } from "@/live/overlay-document";
import {
  InvalidRequestBodyError,
  RequestBodyTooLargeError,
  readJsonObject,
} from "@/http/request-body";
import { viewerDocumentResponse } from "@/live/viewer-document";

interface DurableObjectStubLike {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

export interface LiveWorkerEnvironment {
  CAPTION_ROOMS: DurableObjectNamespaceLike;
  CLOUDFLARE_ACCESS_AUD?: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
  CAPTION_LOCAL_AUTH_BYPASS?: string;
  OBS_CHANNEL_ENCRYPTION_KEY?: string;
}

interface InternalChannelDetails {
  configured: boolean;
  encryptedToken?: string;
  status: ChannelStatus;
  style?: CaptionStyle;
  startedAt?: number | null;
  expiresAt?: number | null;
  transcriptionRequests?: number;
  translationRevision?: number;
}

const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};
const CONTROLLER_HEADER = "x-caption-controller";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function channelRoom(env: LiveWorkerEnvironment) {
  return env.CAPTION_ROOMS.get(
    env.CAPTION_ROOMS.idFromName(`channel:${MAIN_CHANNEL_ID}`),
  );
}

async function requireOperator(request: Request, env: LiveWorkerEnvironment) {
  await requireCloudAccess(request, {
    audience: env.CLOUDFLARE_ACCESS_AUD,
    teamDomain: env.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
    allowUnconfigured: env.CAPTION_LOCAL_AUTH_BYPASS === "true",
  });
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
    translationRevision: normalizeTranslationRevision(
      internal.translationRevision,
    ),
  };
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
  await requireOperator(request, env);
  const body = (await readJsonObject(request, 4_096)) as {
    style?: unknown;
    takeover?: unknown;
  };
  if (body.takeover !== undefined && typeof body.takeover !== "boolean") {
    throw new InvalidRequestBodyError();
  }
  const style = optionalStyle(body.style);
  const controllerToken = randomToken();
  const viewerToken = randomToken();
  const response = await channelRoom(env).fetch(
    new Request("https://caption-room/internal/service", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        controllerHash: await captionTokenHash(controllerToken),
        viewerTokenHash: await captionTokenHash(viewerToken),
        ...(style ? { style } : {}),
        takeover: body.takeover === true,
      }),
    }),
  );
  if (!response.ok) return response;
  const details = await internalJson<{
    status: "live";
    startedAt: string;
    expiresAt: string;
    translationRevision: number;
  }>(response);
  return json({
    channelId: MAIN_CHANNEL_ID,
    controllerToken,
    viewerUrl: viewerUrl(request, viewerToken),
    startedAt: details.startedAt,
    expiresAt: details.expiresAt,
    translationRevision: normalizeTranslationRevision(
      details.translationRevision,
    ),
  });
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
    const label = url.pathname.includes("viewer")
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
