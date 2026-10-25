import { NextResponse } from "next/server";
import { meteredGroq } from "@/experience/metering";

import {
  GroqProviderError,
  transcribeWithGroq,
} from "@/ai/server/groq";
import { isLanguageLocale, type SourceLanguage } from "@/domain/languages";
import {
  CloudAccessError,
  requireCloudAccess,
} from "@/auth/cloudflare-access";
import {
  InvalidRequestBodyError,
  RequestBodyTooLargeError,
  readFormData,
} from "@/http/request-body";

const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 16 * 1024;
const SUPPORTED_AUDIO_TYPES = new Set(["audio/mp4", "audio/ogg", "audio/webm"]);

function errorResponse(error: unknown) {
  if (error instanceof CloudAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof GroqProviderError) {
    return NextResponse.json(
      { error: error.message },
      {
        status: error.status,
        headers: error.retryAfter ? { "retry-after": error.retryAfter } : undefined,
      },
    );
  }
  if (error instanceof RequestBodyTooLargeError) {
    return NextResponse.json(
      { error: "The transcription request is too large." },
      { status: 413 },
    );
  }
  if (error instanceof InvalidRequestBodyError) {
    return NextResponse.json(
      { error: "The transcription request is invalid." },
      { status: 400 },
    );
  }
  return NextResponse.json({ error: "Cloud transcription failed." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    await requireCloudAccess(request);
    const form = await readFormData(request, MAX_REQUEST_BYTES);
    const audio = form.get("audio");
    const sourceLanguage = String(form.get("sourceLanguage") ?? "auto");
    const keywordHintsValue = String(form.get("keywordHints") ?? "[]");
    const previousTranscript = String(form.get("previousTranscript") ?? "").slice(-1_000);

    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: "An audio chunk is required." }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Audio chunks must be 3 MB or smaller." },
        { status: 413 },
      );
    }
    const audioType = audio.type.split(";", 1)[0].toLowerCase();
    if (!SUPPORTED_AUDIO_TYPES.has(audioType)) {
      return NextResponse.json(
        { error: "Audio must be WebM, Ogg, or MP4." },
        { status: 415 },
      );
    }
    if (sourceLanguage !== "auto" && !isLanguageLocale(sourceLanguage)) {
      return NextResponse.json({ error: "Unsupported source language." }, { status: 400 });
    }

    if (keywordHintsValue.length > 8_000) {
      return NextResponse.json({ error: "Too many keyword hints." }, { status: 413 });
    }

    let keywordHints: string[] = [];
    try {
      const parsed = JSON.parse(keywordHintsValue) as unknown;
      if (!Array.isArray(parsed)) throw new InvalidRequestBodyError();
      keywordHints = parsed
        .filter((value): value is string => typeof value === "string")
        .slice(0, 40)
        .map((value) => value.slice(0, 100));
    } catch {
      return NextResponse.json({ error: "Keyword hints are invalid." }, { status: 400 });
    }

    const segments = await meteredGroq(request, "transcription", (telemetry) => transcribeWithGroq({
      audio,
      sourceLanguage: sourceLanguage as SourceLanguage,
      keywordHints,
      previousTranscript,
      signal: request.signal,
      telemetry,
    }));
    return NextResponse.json({ segments }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
