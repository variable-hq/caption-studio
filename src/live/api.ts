import {
  CloudAccessError,
  requireCloudAccess,
} from "@/auth/cloudflare-access";
import { captionTokenHash } from "@/live/caption-room";
import {
  MAX_LIVE_SESSION_MS,
  isLiveSessionId,
  normalizeCaptionStyle,
  type CaptionStyle,
  type LiveSessionDetails,
} from "@/live/contracts";
import { overlayDocumentResponse } from "@/live/overlay-document";

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
}

const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function room(env: LiveWorkerEnvironment, sessionId: string) {
  return env.CAPTION_ROOMS.get(env.CAPTION_ROOMS.idFromName(sessionId));
}

async function requireOperator(request: Request, env: LiveWorkerEnvironment) {
  await requireCloudAccess(request, {
    audience: env.CLOUDFLARE_ACCESS_AUD,
    teamDomain: env.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
    allowUnconfigured: env.CAPTION_LOCAL_AUTH_BYPASS === "true",
  });
}

async function createSession(request: Request, env: LiveWorkerEnvironment) {
  await requireOperator(request, env);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 4_096) return json({ error: "Session configuration is too large." }, 413);

  const body = (await request.json().catch(() => ({}))) as {
    style?: Partial<CaptionStyle>;
  };
  const style = normalizeCaptionStyle(body.style ?? {});
  const sessionId = crypto.randomUUID();
  const overlayToken = randomToken();
  const expiresAt = Date.now() + MAX_LIVE_SESSION_MS;
  const internalResponse = await room(env, sessionId).fetch(
    new Request("https://caption-room/internal/initialize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tokenHash: await captionTokenHash(overlayToken),
        expiresAt,
        style,
      }),
    }),
  );
  if (!internalResponse.ok) {
    return json({ error: "Could not initialize the live caption room." }, 502);
  }

  const overlayUrl = new URL("/overlay", request.url);
  overlayUrl.hash = `${sessionId}.${overlayToken}`;
  const details: LiveSessionDetails = {
    sessionId,
    overlayUrl: overlayUrl.toString(),
    expiresAt: new Date(expiresAt).toISOString(),
  };
  return json(details, 201);
}

async function publishCaption(
  request: Request,
  env: LiveWorkerEnvironment,
  sessionId: string,
) {
  await requireOperator(request, env);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 8_192) return json({ error: "Caption event is too large." }, 413);
  return room(env, sessionId).fetch(
    new Request("https://caption-room/internal/caption", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: await request.text(),
    }),
  );
}

async function updateStyle(
  request: Request,
  env: LiveWorkerEnvironment,
  sessionId: string,
) {
  await requireOperator(request, env);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 4_096) return json({ error: "Caption style is too large." }, 413);
  const body = (await request.json().catch(() => ({}))) as {
    style?: Partial<CaptionStyle>;
  };
  return room(env, sessionId).fetch(
    new Request("https://caption-room/internal/style", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ style: normalizeCaptionStyle(body.style ?? {}) }),
    }),
  );
}

async function revokeSession(
  request: Request,
  env: LiveWorkerEnvironment,
  sessionId: string,
) {
  await requireOperator(request, env);
  return room(env, sessionId).fetch(
    new Request("https://caption-room/internal/session", { method: "DELETE" }),
  );
}

async function connectOverlay(
  request: Request,
  env: LiveWorkerEnvironment,
  sessionId: string,
) {
  return room(env, sessionId).fetch(
    new Request("https://caption-room/internal/connect", request),
  );
}

export async function handleLiveApiRequest(
  request: Request,
  env: LiveWorkerEnvironment,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/overlay" && request.method === "GET") {
    return overlayDocumentResponse();
  }
  if (url.pathname === "/api/live/overlay" && request.method === "GET") {
    const sessionId = url.searchParams.get("session") ?? "";
    return isLiveSessionId(sessionId)
      ? connectOverlay(request, env, sessionId)
      : json({ error: "Invalid OBS session." }, 400);
  }

  if (url.pathname === "/api/live/session" && request.method === "POST") {
    try {
      return await createSession(request, env);
    } catch (error) {
      if (error instanceof CloudAccessError) {
        return json({ error: error.message }, error.status);
      }
      return json({ error: "Could not create the caption session." }, 500);
    }
  }

  const match = url.pathname.match(
    /^\/api\/live\/session\/([0-9a-f-]+)(?:\/(caption|style))?$/iu,
  );
  if (!match || !isLiveSessionId(match[1])) return null;

  try {
    if (match[2] === "caption" && request.method === "POST") {
      return await publishCaption(request, env, match[1]);
    }
    if (match[2] === "style" && request.method === "PUT") {
      return await updateStyle(request, env, match[1]);
    }
    if (!match[2] && request.method === "DELETE") {
      return await revokeSession(request, env, match[1]);
    }
    return json({ error: "Unsupported live-session operation." }, 405);
  } catch (error) {
    if (error instanceof CloudAccessError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: "The live-session operation failed." }, 500);
  }
}
