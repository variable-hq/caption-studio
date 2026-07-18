import { NextResponse } from "next/server";

import {
  GroqProviderError,
  transcribeWithGroq,
} from "@/ai/server/groq";
import { isLanguageLocale, type SourceLanguage } from "@/domain/languages";
import {
  CloudAccessError,
  requireCloudAccess,
} from "@/auth/cloudflare-access";

const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 16 * 1024;

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
  return NextResponse.json({ error: "Cloud transcription failed." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    await requireCloudAccess(request);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      return NextResponse.json(
        { error: "The transcription request is too large." },
        { status: 413 },
      );
    }
    const form = await request.formData();
    const audio = form.get("audio");
    const sourceLanguage = String(form.get("sourceLanguage") ?? "auto");
    const keywordHintsValue = String(form.get("keywordHints") ?? "[]");

    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: "An audio chunk is required." }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Audio chunks must be 3 MB or smaller." },
        { status: 413 },
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
      if (Array.isArray(parsed)) {
        keywordHints = parsed
          .filter((value): value is string => typeof value === "string")
          .slice(0, 40)
          .map((value) => value.slice(0, 100));
      }
    } catch {
      return NextResponse.json({ error: "Keyword hints are invalid." }, { status: 400 });
    }

    const segments = await transcribeWithGroq({
      audio,
      sourceLanguage: sourceLanguage as SourceLanguage,
      keywordHints,
    });
    return NextResponse.json({ segments }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
