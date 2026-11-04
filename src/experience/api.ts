import { authorizeOperatorIdentity, type LiveWorkerEnvironment } from "@/live/api";
import { MAX_PREFERENCES_BYTES, WORKSPACE_SETUP_KEY, operatorIdentityKey } from "./preferences";
import { captionTokenHash } from "@/live/caption-room";
import { InvalidRequestBodyError, RequestBodyTooLargeError, readJsonObject } from "@/http/request-body";
import { CAPABILITY_TOKEN_PATTERN, UUID_PATTERN, randomToken } from "@/http/tokens";
import { json, rpc } from "./contracts";
import { MAX_PRESET_COMMAND_BYTES, WORKSPACE_PRESETS_KEY } from "./custom-presets";
import { presetLimits } from "./entitlements";

export async function handleExperienceRequest(request: Request, env: LiveWorkerEnvironment) {
  const url = new URL(request.url);
  const publicReader = url.pathname === "/api/live/reader";
  if (!publicReader && !url.pathname.startsWith("/api/live/experience/")) return null;
  try {
    if (publicReader) {
      if (request.method !== "GET") return json({ error: "Use GET." }, 405);
      const [id, reader] = (request.headers.get("x-caption-reader") ?? "").split(".");
      if (!UUID_PATTERN.test(id ?? "") || !CAPABILITY_TOKEN_PATTERN.test(reader ?? "")) return json({ error: "Invalid reader link." }, 403);
      if (!env.TRANSCRIPT_JOURNALS) return json({ error: "Reader is not configured." }, 503);
      const journal = env.TRANSCRIPT_JOURNALS.get(env.TRANSCRIPT_JOURNALS.idFromName(id));
      return journal.fetch(new Request(`https://internal/read?after=${Math.max(0, Number(url.searchParams.get("after")) || 0)}`, {
        headers: { "x-reader-hash": await captionTokenHash(reader) },
      }));
    }
    const operation = url.pathname.slice("/api/live/experience/".length);
    if (operation === "presets") {
      // The workspace's custom presets: one record every signed-in operator shares.
      if (!["GET", "POST"].includes(request.method)) return json({ error: "Use GET or POST." }, 405);
      const authorized = await authorizeOperatorIdentity(request, env);
      if (authorized.denied) return authorized.denied;
      if (!env.OPERATOR_PREFERENCES) return json({ error: "Operator preferences are not configured." }, 503);
      const body = request.method === "POST" ? await readJsonObject(request, MAX_PRESET_COMMAND_BYTES) : undefined;
      // The plan's allowance is set here from the Worker variable and passed along, never taken from the body.
      const max = presetLimits(env.WORKSPACE_PLAN).maxCustomPresets;
      const target = env.OPERATOR_PREFERENCES.get(env.OPERATOR_PREFERENCES.idFromName(WORKSPACE_PRESETS_KEY));
      return target.fetch(new Request(`https://internal/presets?max=${max}`, {
        method: request.method, signal: AbortSignal.timeout(8000),
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }));
    }
    if (operation === "preferences" || operation === "setup") {
      if (!["GET", "POST", "DELETE"].includes(request.method)) return json({ error: "Use GET, POST, or DELETE." }, 405);
      const authorized = await authorizeOperatorIdentity(request, env);
      if (authorized.denied) return authorized.denied;
      if (!env.OPERATOR_PREFERENCES) return json({ error: "Operator preferences are not configured." }, 503);
      // "setup" is the workspace-wide record every signed-in operator shares (ADR 0022).
      const key = operation === "setup" ? WORKSPACE_SETUP_KEY : await operatorIdentityKey(authorized.identity);
      const target = env.OPERATOR_PREFERENCES.get(env.OPERATOR_PREFERENCES.idFromName(key));
      const body = request.method === "POST" ? await readJsonObject(request, MAX_PREFERENCES_BYTES) : undefined;
      return target.fetch(new Request("https://internal/preferences", {
        method: request.method, signal: AbortSignal.timeout(8000),
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }));
    }
    const operator = await authorizeOperatorIdentity(request, env);
    if (operator.denied) return operator.denied;
    if (operation === "usage" && request.method === "GET") {
      return env.AI_USAGE ? rpc(env.AI_USAGE, "usage", `/history?after=${encodeURIComponent((url.searchParams.get("after") ?? "").slice(0, 220))}`)
        : json({ error: "Usage history is not configured." }, 503);
    }
    if (operation === "history" && request.method === "GET") {
      const history = await rpc(env.CAPTION_ROOMS, "channel:main", "/internal/history");
      if (!history.ok || !env.TRANSCRIPT_JOURNALS) return history;
      const body = await history.json() as { sessions: { id: string; startedAt: number }[] };
      const sessions = await Promise.all(body.sessions.slice(0, 50).map(async (entry) => {
        try {
          const metadata = await rpc(env.TRANSCRIPT_JOURNALS!, entry.id, "/metadata");
          if (!metadata.ok) return entry;
          const details = await metadata.json() as { metadata?: unknown; presetId?: unknown };
          return { ...entry, metadata: details.metadata, presetId: details.presetId };
        } catch { return entry; }
      }));
      return json({ sessions, services: sessions });
    }
    const parts = operation.split("/");
    if (parts.length === 3 && (parts[0] === "transcripts" || parts[0] === "sermons") && UUID_PATTERN.test(parts[1] ?? "") &&
        ["archive", "summary", "remove", "correct", "delete", "metadata"].includes(parts[2])) {
      if (!env.TRANSCRIPT_JOURNALS) return json({ error: "Transcript archive is not configured." }, 503);
      if (parts[2] === "archive" && request.method === "GET") return rpc(env.TRANSCRIPT_JOURNALS, parts[1],
        `/archive?after=${Math.max(0, Number(url.searchParams.get("after")) || 0)}&paragraphAfter=${Math.max(0, Number(url.searchParams.get("paragraphAfter")) || 0)}`);
      if (parts[2] === "metadata" && request.method === "GET") return rpc(env.TRANSCRIPT_JOURNALS, parts[1], "/metadata");
      if (parts[2] === "archive") return json({ error: "Use GET." }, 405);
      if (request.method !== "POST") return json({ error: "Use POST." }, 405);
      const body = await readJsonObject(request, 32768) as Record<string, unknown>;
      if (parts[2] === "delete" && body.confirm !== true) return json({ error: "Confirm transcript deletion." }, 400);
      if (parts[2] === "remove" && body.confirm !== true) return json({ error: "Confirm passage removal." }, 400);
      const result = await rpc(env.TRANSCRIPT_JOURNALS, parts[1], `/${parts[2]}`, body);
      if (parts[2] === "delete" && (result.ok || result.status === 410)) {
        return await rpc(env.CAPTION_ROOMS, "channel:main", "/internal/history/delete", { id: parts[1] });
      }
      if (result.ok && parts[2] === "remove") {
        const removed = await result.clone().json() as { sourceIds: number[] };
        await rpc(env.CAPTION_ROOMS, "channel:main", "/internal/experience/remove-current", { sessionId: parts[1], sourceIds: removed.sourceIds });
      }
      return result;
    }
    if (!["pair", "host", "remote", "source", "gap", "reader-rotate"].includes(operation) || request.method !== "POST") return json({ error: "Experience route not found." }, 404);
    const body = await readJsonObject(request, 32768);
    const controller = request.headers.get("x-caption-controller");
    const scoped = request.headers.get("x-caption-remote");
    const issued = ["pair", "reader-rotate"].includes(operation) ? randomToken() : undefined;
    const payload = { ...body, controllerHash: controller ? await captionTokenHash(controller) : undefined,
      // Pairing is per signed-in operator, so four phones can control one session.
      identityKey: operation === "pair" ? await operatorIdentityKey(operator.identity) : undefined,
      remoteHash: operation === "pair" ? await captionTokenHash(issued!) : scoped ? await captionTokenHash(scoped) : undefined,
      readerHash: operation === "reader-rotate" ? await captionTokenHash(issued!) : undefined };
    const response = await rpc(env.CAPTION_ROOMS, "channel:main", `/internal/experience/${operation}`, payload);
    if (!response.ok || !issued) return response;
    const result = await response.json() as { sessionId: string };
    const link = new URL(operation === "pair" ? "/operator/mobile" : "/read", request.url);
    link.hash = `${result.sessionId}.${issued}`;
    return json({ url: link.toString() });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return json({ error: "Request body is too large." }, 413);
    if (error instanceof InvalidRequestBodyError) return json({ error: "Invalid JSON request." }, 400);
    return json({ error: "The service request failed. Check the connection and retry." }, 503);
  }
}
