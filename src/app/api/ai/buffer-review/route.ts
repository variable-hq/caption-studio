import { NextResponse } from "next/server";
import { meteredGroq } from "@/experience/metering";

import {
  GroqProviderError,
  reviewBufferWithGroq,
} from "@/ai/server/groq";
import {
  MAX_BUFFER_REVIEW_ENTRIES,
  MAX_BUFFER_REVIEW_TEXT_CHARS,
  type BufferReviewEntry,
  type BufferReviewRequest,
} from "@/ai/contracts";
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
const ENTRY_ID = /^[A-Za-z0-9_-]{1,64}$/;

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
      { error: "The buffer review request is too large." },
      { status: 413 },
    );
  }
  if (error instanceof InvalidRequestBodyError) {
    return NextResponse.json(
      { error: "The buffer review request is invalid." },
      { status: 400 },
    );
  }
  return NextResponse.json({ error: "Buffer review failed." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    await requireCloudAccess(request);
    const body = (await readJsonObject(
      request,
      MAX_REQUEST_BYTES,
    )) as Partial<BufferReviewRequest>;

    if (!body.targetLanguage || !isLanguageLocale(body.targetLanguage)) {
      return NextResponse.json({ error: "Unsupported language selection." }, { status: 400 });
    }
    if (typeof body.liveText !== "string" || body.liveText.length > MAX_BUFFER_REVIEW_TEXT_CHARS) {
      return NextResponse.json({ error: "Live caption text is invalid." }, { status: 400 });
    }
    if (!Array.isArray(body.entries) || body.entries.length < 1 || body.entries.length > MAX_BUFFER_REVIEW_ENTRIES) {
      return NextResponse.json(
        { error: `Provide between 1 and ${MAX_BUFFER_REVIEW_ENTRIES} queued captions to review.` },
        { status: 400 },
      );
    }
    const entries: BufferReviewEntry[] = [];
    for (const entry of body.entries) {
      if (
        !entry ||
        typeof entry !== "object" ||
        !ENTRY_ID.test((entry as Partial<BufferReviewEntry>).id ?? "") ||
        typeof (entry as Partial<BufferReviewEntry>).text !== "string" ||
        (entry as BufferReviewEntry).text.length > MAX_BUFFER_REVIEW_TEXT_CHARS
      ) {
        return NextResponse.json({ error: "Each queued caption must have a valid id and text." }, { status: 400 });
      }
      entries.push({ id: (entry as BufferReviewEntry).id, text: (entry as BufferReviewEntry).text });
    }

    const result = await meteredGroq(request, "buffer-review", (telemetry) => reviewBufferWithGroq(
      {
        targetLanguage: body.targetLanguage!,
        liveText: body.liveText!,
        entries,
      },
      request.signal,
      telemetry,
    ));
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
