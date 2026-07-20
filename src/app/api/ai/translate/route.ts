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
      { error: error.message },
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
