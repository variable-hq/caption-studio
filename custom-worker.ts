// @ts-expect-error The OpenNext worker is generated during the Cloudflare build.
import nextHandler from "./.open-next/worker.js";

import { handleLiveApiRequest } from "./src/live/api";
import { handleTranslationRequest } from "./src/live/translation-request";
export { CaptionRoom } from "./src/live/caption-room";

export default {
  async fetch(request: Request, env: CloudflareEnv, context: ExecutionContext) {
    const liveResponse = await handleLiveApiRequest(request, env);
    if (liveResponse) return liveResponse;

    const url = new URL(request.url);
    const isTranslationRequest =
      request.method === "POST" && url.pathname === "/api/ai/translate";
    if (!isTranslationRequest) {
      return nextHandler.fetch(request, env, context);
    }

    return handleTranslationRequest(request, env, () =>
      nextHandler.fetch(request, env, context),
    );
  },
} satisfies ExportedHandler<CloudflareEnv>;
