import { NextResponse } from "next/server";

import { getCloudProviderHealth } from "@/ai/server/groq";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getCloudProviderHealth(), {
    headers: { "cache-control": "no-store" },
  });
}
