import { NextResponse } from "next/server";

import { ProviderError } from "@/ai/server/groq";
import { verifyWorkspaceProviders } from "@/ai/server/inference";
import {
  CloudAccessError,
  requireCloudAccess,
} from "@/auth/cloudflare-access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireCloudAccess(request);
    return NextResponse.json(await verifyWorkspaceProviders(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CloudAccessError || error instanceof ProviderError) {
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
