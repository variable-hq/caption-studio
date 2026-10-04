import {
  MAX_TRANSLATION_COMPLETION_TOKENS,
  type LlmSessionUsage,
  type ProviderRateLimitWindow,
} from "@/ai/contracts";
import {
  consumptionPercent,
  consumptionStatus,
} from "@/ai/usage";
import { formatCount, UsageMetric } from "@/components/operator/UsageMetric";

interface AiUsageDashboardProps {
  llmUsage: LlmSessionUsage;
  translationModel: string;
}

function ProviderWindow({
  label,
  window,
  scope,
}: {
  label: string;
  window: ProviderRateLimitWindow | null;
  scope: string;
}) {
  if (!window) {
    return (
      <UsageMetric
        label={label}
        value="Unavailable"
        detail={`Groq did not report the ${scope} window on the latest response.`}
      />
    );
  }
  const used = Math.max(0, window.limit - window.remaining);
  const percent = consumptionPercent(used, window.limit);
  return (
    <UsageMetric
      label={label}
      value={`${formatCount(window.remaining)} remaining`}
      detail={`${formatCount(window.limit)} ${scope}${
        window.reset ? ` · resets in ${window.reset}` : ""
      }`}
      status={consumptionStatus(used, window.limit)}
      percent={percent}
      ariaValueText={`${formatCount(used)} used and ${formatCount(
        window.remaining,
      )} remaining of ${formatCount(window.limit)}`}
    />
  );
}

export function AiUsageDashboard({
  llmUsage,
  translationModel,
}: AiUsageDashboardProps) {
  const provider = llmUsage.providerRateLimit;

  return (
    <div className="usageDashboard">
      <section className="usageSection" aria-labelledby="provider-usage-heading">
        <div className="usageSectionHeading">
          <div>
            <h3 id="provider-usage-heading">Groq quota headroom</h3>
          </div>
          <code>{provider?.model ?? translationModel}</code>
        </div>
        {provider ? (
          <>
            <div className="usageSummaryGrid providerUsageGrid">
              <ProviderWindow
                label="Daily requests"
                window={provider.requestsPerDay}
                scope="requests per day"
              />
              <ProviderWindow
                label="Minute tokens"
                window={provider.tokensPerMinute}
                scope="tokens per minute"
              />
            </div>
            <p className="usageScopeNote">
              Snapshot observed {new Date(provider.observedAt).toLocaleString()}.
              Provider headroom is shared across the Groq organization and can change
              because of other applications.
            </p>
          </>
        ) : (
          <div className="providerSnapshotEmpty">
            <strong>Waiting for provider quota information</strong>
            <p>
              Groq reports daily-request and per-minute-token headroom with a
              translation response. Daily token and complete account consumption are
              not available through these response headers.
            </p>
          </div>
        )}
      </section>

      <p className="helpText">
        FYI: the free path caps each translation at {MAX_TRANSLATION_COMPLETION_TOKENS}{" "}
        completion tokens, never falls back to a paid tier, and simply ends capture if
        Groq&apos;s quota runs out — the reusable OBS channel stays ready to resume.{" "}
        <a href="https://console.groq.com/docs/rate-limits" target="_blank" rel="noreferrer">
          Review Groq rate-limit definitions
        </a>
      </p>
    </div>
  );
}
