import { NextResponse } from "next/server";
import { meteredGroq } from "@/experience/metering";

import {
  GroqProviderError,
  translateWithGroq,
} from "@/ai/server/groq";
import type { TranslationRequest } from "@/ai/contracts";
import { MAX_LIVE_NOTE_CHARS, normalizeLiveNote } from "@/live/live-note";
import { normalizeInferenceLevel, normalizeSanitizeLevel } from "@/ai/contracts";
import {
  InvalidTranslationSystemPromptError,
  DISALLOWED_CONTROL_CHARACTERS,
  normalizeTranslationSystemPrompt,
} from "@/ai/translation-prompt";
import { isLanguageLocale } from "@/domain/languages";
import {
  CloudAccessError,
  requireCloudAccess,
} from "@/auth/cloudflare-access";
import {
  InvalidRequestBodyError,
  RequestBodyTooLargeError,
  readJsonObject,
} from "@/http/request-body";

const MAX_REQUEST_BYTES = 32_000;

function errorResponse(error: unknown) {
  if (error instanceof CloudAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof GroqProviderError) {
    return NextResponse.json(
      {
        error: error.message,
        ...(error.rateLimit ? { rateLimit: error.rateLimit } : {}),
      },
      {
        status: error.status,
        headers: error.retryAfter ? { "retry-after": error.retryAfter } : undefined,
      },
    );
  }
  if (error instanceof RequestBodyTooLargeError) {
    return NextResponse.json(
      { error: "The translation request is too large." },
      { status: 413 },
    );
  }
  if (error instanceof InvalidRequestBodyError) {
    return NextResponse.json(
      { error: "The translation request is invalid." },
      { status: 400 },
    );
  }
  if (error instanceof InvalidTranslationSystemPromptError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Cloud translation failed." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    await requireCloudAccess(request);
    const body = (await readJsonObject(
      request,
      MAX_REQUEST_BYTES,
    )) as Partial<TranslationRequest>;
    if (!body.text?.trim() || body.text.length > 4_000) {
      return NextResponse.json(
        { error: "Translation text must be between 1 and 4,000 characters." },
        { status: 400 },
      );
    }
    if (
      !body.sourceLanguage ||
      !body.targetLanguage ||
      !isLanguageLocale(body.sourceLanguage) ||
      !isLanguageLocale(body.targetLanguage)
    ) {
      return NextResponse.json({ error: "Unsupported language selection." }, { status: 400 });
    }

    const preferredTerms =
      body.preferredTerms &&
      typeof body.preferredTerms === "object" &&
      !Array.isArray(body.preferredTerms)
        ? Object.fromEntries(
            Object.entries(body.preferredTerms)
              .filter(
                (entry): entry is [string, string] =>
                  typeof entry[0] === "string" && typeof entry[1] === "string",
              )
              .slice(0, 60)
              .map(([source, target]) => [source.slice(0, 100), target.slice(0, 100)]),
          )
        : {};
    const translationSystemPrompt = normalizeTranslationSystemPrompt(
      body.translationSystemPrompt,
    );
    const liveNote = body.liveNote === undefined ? undefined : normalizeLiveNote(body.liveNote);
    if (body.liveNote !== undefined && (typeof body.liveNote !== "string" || DISALLOWED_CONTROL_CHARACTERS.test(body.liveNote) || body.liveNote.trim().length > MAX_LIVE_NOTE_CHARS)) {
      return NextResponse.json({ error: `Live note must be up to ${MAX_LIVE_NOTE_CHARS} characters without control characters.` }, { status: 400 });
    }

    const result = await meteredGroq(request, "translation", (telemetry) => translateWithGroq(
      {
        text: body.text!,
        sourceLanguage: body.sourceLanguage!,
        targetLanguage: body.targetLanguage!,
        recentContext: Array.isArray(body.recentContext)
          ? body.recentContext
              .filter((value): value is string => typeof value === "string")
              .slice(-4)
              .map((value) => value.slice(0, 1_000))
          : [],
        preferredTerms,
        translationSystemPrompt,
        inferenceLevel: normalizeInferenceLevel(body.inferenceLevel),
        sanitizeLevel: normalizeSanitizeLevel(body.sanitizeLevel),
        filterInappropriateLanguage: body.filterInappropriateLanguage !== false,
        ...(liveNote ? { liveNote } : {}),
        presetId: typeof body.presetId === "string" ? body.presetId : undefined,
      },
      request.signal,
      telemetry,
    ));
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
