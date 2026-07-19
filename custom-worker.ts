// @ts-expect-error The OpenNext worker is generated during the Cloudflare build.
import nextHandler from "./.open-next/worker.js";

import { handleLiveApiRequest } from "./src/live/api";
export { CaptionRoom } from "./src/live/caption-room";

export default {
  async fetch(request: Request, env: CloudflareEnv, context: ExecutionContext) {
    const liveResponse = await handleLiveApiRequest(request, env);
    return liveResponse ?? nextHandler.fetch(request, env, context);
  },
} satisfies ExportedHandler<CloudflareEnv>;
