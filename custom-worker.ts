// @ts-expect-error The OpenNext worker is generated during the Cloudflare build.
import nextHandler from "./.open-next/worker.js";

import { handleLiveApiRequest } from "./src/live/api";
import { handleInferenceRequest } from "./src/live/inference-request";
import { handleExperienceRequest } from "./src/experience/api";
export { CaptionRoom } from "./src/live/caption-room";
export { SermonJournal } from "./src/experience/sermon-journal";
export { AiUsageLedger } from "./src/experience/usage-ledger";
export { OperatorPreferences } from "./src/experience/operator-preferences";

export default {
  async fetch(request: Request, env: CloudflareEnv, context: ExecutionContext) {
    const experience = await handleExperienceRequest(request, env);
    if (experience) return experience;
    const liveResponse = await handleLiveApiRequest(request, env);
    if (liveResponse) return liveResponse;

    return handleInferenceRequest(request, env, () =>
      nextHandler.fetch(request, env, context),
    );
  },
} satisfies ExportedHandler<CloudflareEnv>;
