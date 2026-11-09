import { NextResponse } from "next/server";

import { workspaceProviderHealth } from "@/ai/server/inference";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await workspaceProviderHealth(), {
    headers: { "cache-control": "no-store" },
  });
}
