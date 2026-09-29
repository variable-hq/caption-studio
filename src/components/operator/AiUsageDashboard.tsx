import {
  MAX_TRANSLATION_COMPLETION_TOKENS,
  type LlmSessionUsage,
  type ProviderRateLimitWindow,
} from "@/ai/contracts";
import {
  consumptionPercent,
  consumptionStatus,
} from "@/ai/usage";
import {
  MAX_LIVE_SESSION_MS,
  MAX_TRANSCRIPTION_REQUESTS,
} from "@/live/contracts";
import { formatMinutesSeconds } from "@/components/operator/format-duration";

interface AiUsageDashboardProps {
  active: boolean;
  statusLabel: string;
  elapsedServiceMs: number;
  transcriptionRequests: number;
  llmUsage: LlmSessionUsage;
  translationModel: string;
}

interface UsageMetricProps {
  label: string;
  value: string;
  detail: string;
  status?: string;
  percent?: number;
  ariaValueText?: string;
}

const numberFormatter = new Intl.NumberFormat("en");

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function formatDuration(value: number) {
  const totalSeconds = Math.max(0, Math.floor(value / 1_000));
  return formatMinutesSeconds(Math.floor(totalSeconds / 60), totalSeconds % 60);
}

function UsageMetric({
  label,
  value,
  detail,
  status,
  percent,
  ariaValueText,
}: UsageMetricProps) {
  return (
    <article className="usageMetricCard">
      <div className="usageMetricHeading">
        <h4>{label}</h4>
        {status ? <span>{status}</span> : null}
      </div>
      <p className="usageMetricValue">{value}</p>
      <p className="usageMetricDetail">{detail}</p>
      {typeof percent === "number" ? (
        <div
          className="usageTrack"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={ariaValueText}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </article>
  );
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
  active,
  statusLabel,
  elapsedServiceMs,
  transcriptionRequests,
  llmUsage,
  translationModel,
}: AiUsageDashboardProps) {
  const timePercent = consumptionPercent(
    elapsedServiceMs,
    MAX_LIVE_SESSION_MS,
  );
  const transcriptionPercent = consumptionPercent(
    transcriptionRequests,
    MAX_TRANSCRIPTION_REQUESTS,
  );
  const provider = llmUsage.providerRateLimit;

  return (
    <div className="usageDashboard">
      <section className="usageSection" aria-labelledby="service-usage-heading">
        <div className="usageSectionHeading">
          <div>
            <h3 id="service-usage-heading">Current live service</h3>
          </div>
          <span className={`statusChip ${active ? "live" : ""}`}>
            {statusLabel}
          </span>
        </div>
        <div className="usageSummaryGrid">
          <UsageMetric
            label="Service window"
            value={`${formatDuration(elapsedServiceMs)} / 90m`}
            detail="The timer continues while the live service is paused."
            status={consumptionStatus(elapsedServiceMs, MAX_LIVE_SESSION_MS)}
            percent={timePercent}
            ariaValueText={`${formatDuration(elapsedServiceMs)} used of 90 minutes`}
          />
          <UsageMetric
            label="Transcription attempts"
            value={`${formatCount(transcriptionRequests)} / ${formatCount(
              MAX_TRANSCRIPTION_REQUESTS,
            )}`}
            detail="Reserved before each audio request; silence and failed calls can still count."
            status={consumptionStatus(
              transcriptionRequests,
              MAX_TRANSCRIPTION_REQUESTS,
            )}
            percent={transcriptionPercent}
            ariaValueText={`${formatCount(
              transcriptionRequests,
            )} attempts used of ${formatCount(MAX_TRANSCRIPTION_REQUESTS)}`}
          />
          <UsageMetric
            label="Translation calls"
            value={formatCount(llmUsage.translationRequests)}
            detail="Responses with recorded usage, including skipped incomplete output. Same-language captions bypass translation."
          />
          <UsageMetric
            label="Translation tokens"
            value={formatCount(llmUsage.totalTokens)}
            detail={`${formatCount(llmUsage.promptTokens)} prompt · ${formatCount(
              llmUsage.completionTokens,
            )} completion`}
          />
        </div>
        <p className="usageScopeNote">
          These totals belong to this service and survive an operator-page refresh.
          They are not billing totals for the whole Groq account.
        </p>
      </section>

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

      <section className="usageSection usageGuardrails" aria-labelledby="guardrail-heading">
        <div>
          <h3 id="guardrail-heading">How the free path fails safely</h3>
        </div>
        <dl>
          <div>
            <dt>Per translation</dt>
            <dd>{MAX_TRANSLATION_COMPLETION_TOKENS} completion-token maximum</dd>
          </div>
          <div>
            <dt>Paid fallback</dt>
            <dd>Off</dd>
          </div>
          <div>
            <dt>Quota exhausted</dt>
            <dd>Capture ends; the reusable OBS channel stays ready</dd>
          </div>
        </dl>
        <a
          href="https://console.groq.com/docs/rate-limits"
          target="_blank"
          rel="noreferrer"
        >
          Review Groq rate-limit definitions
        </a>
      </section>
    </div>
  );
}
