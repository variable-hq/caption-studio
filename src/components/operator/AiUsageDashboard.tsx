import {
  MAX_TRANSLATION_COMPLETION_TOKENS,
  type LlmSessionUsage,
  type ProviderRateLimitWindow,
} from "@/ai/contracts";
import { formatCount } from "@/components/operator/format-count";
import { SettingGroup } from "@/components/operator/SettingsParts";

interface AiUsageDashboardProps {
  llmUsage: LlmSessionUsage;
}

function remaining(window: ProviderRateLimitWindow | null) {
  if (!window) return { value: "—", detail: "Not reported" };
  return {
    value: formatCount(window.remaining),
    detail: `of ${formatCount(window.limit)}${window.reset ? ` · resets in ${window.reset}` : ""}`,
  };
}

/** Settings › Usage: how much the translation service has left, as last reported. */
export function AiUsageDashboard({ llmUsage }: AiUsageDashboardProps) {
  const provider = llmUsage.providerRateLimit;
  const requests = remaining(provider?.requestsPerDay ?? null);
  const tokens = remaining(provider?.tokensPerMinute ?? null);
  return (
    <SettingGroup
      title="Translation service right now"
      hint={provider
        ? `As reported with the last translation, ${new Date(provider.observedAt).toLocaleString()}. Other apps on the same account share these limits.`
        : "Shown after the first translated caption of a service."}
    >
      <div className="statTiles">
        <div className="statTile"><span>Requests left today</span><strong>{requests.value}</strong><small>{requests.detail}</small></div>
        <div className="statTile"><span>Tokens left this minute</span><strong>{tokens.value}</strong><small>{tokens.detail}</small></div>
      </div>
      <p className="settingHint">
        Each translation is capped at {MAX_TRANSLATION_COMPLETION_TOKENS} tokens. If the free allowance runs out, captions stop;
        the OBS link keeps working for the next service.
      </p>
    </SettingGroup>
  );
}
