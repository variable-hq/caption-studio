import { NextResponse } from "next/server";

import {
  GroqProviderError,
  verifyGroqProvider,
} from "@/ai/server/groq";
import {
  CloudAccessError,
  requireCloudAccess,
} from "@/auth/cloudflare-access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireCloudAccess(request);
    return NextResponse.json(await verifyGroqProvider(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CloudAccessError || error instanceof GroqProviderError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "Cloud AI credentials could not be verified." },
      { status: 502 },
    );
  }
}
