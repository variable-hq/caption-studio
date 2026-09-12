import {
  authorizeProtectedAiRequest,
  claimTranscriptionAttempt,
  type LiveWorkerEnvironment,
} from "@/live/api";
import { handleTranslationRequest } from "@/live/translation-request";

export async function handleInferenceRequest(
  request: Request,
  env: LiveWorkerEnvironment,
  invokeProviderRoute: () => Promise<Response>,
) {
  const pathname = new URL(request.url).pathname;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname).replace(/\/{2,}/gu, "/").replace(/\/+$/u, "");
  } catch {
    return Response.json({ error: "Invalid request path." }, { status: 400 });
  }
  // This App Router app has no Pages data endpoints. OpenNext can rewrite these
  // URLs into API routes, so reject them before the inference claim boundary.
  if (decodedPath.startsWith("/_next/data/")) {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
  if (decodedPath !== "/api/ai/transcribe" && decodedPath !== "/api/ai/translate") {
    return invokeProviderRoute();
  }
  // Reject route aliases before Next.js can normalize them around the claim boundary.
  if (pathname !== decodedPath || request.method !== "POST") {
    return Response.json({ error: "Use the canonical inference POST route." }, {
      status: pathname !== decodedPath ? 400 : 405,
      headers: { "cache-control": "no-store", allow: "POST" },
    });
  }
  if (decodedPath === "/api/ai/translate") {
    return handleTranslationRequest(request, env, invokeProviderRoute);
  }

  const accessError = await authorizeProtectedAiRequest(request, env);
  if (accessError) return accessError;
  let claim: Response;
  try {
    claim = await claimTranscriptionAttempt(
      env,
      request.headers.get("x-caption-controller")?.trim() ?? "",
      Number(request.headers.get("x-caption-transcription-attempt")),
    );
  } catch {
    return Response.json({
      error: "Transcription authentication could not be confirmed. Captions stopped before provider usage.",
      code: "transcription_authorization_unavailable",
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (!claim.ok) return claim;
  return invokeProviderRoute();
}
