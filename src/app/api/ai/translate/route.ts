import { NextResponse } from "next/server";

import {
  GroqProviderError,
  translateWithGroq,
} from "@/ai/server/groq";
import type { TranslationRequest } from "@/ai/contracts";
import { isLanguageLocale } from "@/domain/languages";
import {
  CloudAccessError,
  requireCloudAccess,
} from "@/auth/cloudflare-access";

const MAX_REQUEST_CHARACTERS = 32_000;

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
  return NextResponse.json({ error: "Cloud translation failed." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    await requireCloudAccess(request);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_REQUEST_CHARACTERS) {
      return NextResponse.json({ error: "The translation request is too large." }, { status: 413 });
    }
    const rawBody = await request.text();
    if (rawBody.length > MAX_REQUEST_CHARACTERS) {
      return NextResponse.json({ error: "The translation request is too large." }, { status: 413 });
    }
    let body: Partial<TranslationRequest>;
    try {
      body = JSON.parse(rawBody) as Partial<TranslationRequest>;
    } catch {
      return NextResponse.json({ error: "The translation request is invalid." }, { status: 400 });
    }
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
      body.preferredTerms && typeof body.preferredTerms === "object"
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

    const result = await translateWithGroq(
      {
        text: body.text,
        sourceLanguage: body.sourceLanguage,
        targetLanguage: body.targetLanguage,
        recentContext: Array.isArray(body.recentContext)
          ? body.recentContext
              .filter((value): value is string => typeof value === "string")
              .slice(-4)
              .map((value) => value.slice(0, 1_000))
          : [],
        preferredTerms,
      },
      request.signal,
    );
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
