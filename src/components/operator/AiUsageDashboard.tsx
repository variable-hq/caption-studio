import {
  MAX_TRANSLATION_COMPLETION_TOKENS,
  type LlmSessionUsage,
  type ProviderRateLimitWindow,
} from "@/ai/contracts";
import { formatCount } from "@/components/operator/format-count";
import { formatObservedAt } from "@/components/operator/format-observed-at";
import { SettingGroup } from "@/components/operator/SettingsParts";
import { useI18n, useT } from "@/i18n/provider";

interface AiUsageDashboardProps {
  llmUsage: LlmSessionUsage;
}

type Translator = ReturnType<typeof useT>;

function remaining(window: ProviderRateLimitWindow | null, locale: "en" | "id", t: Translator) {
  if (!window) return { value: "—", detail: t("aiUsage.notReported") };
  return {
    value: formatCount(window.remaining, locale),
    detail: window.reset
      ? t("aiUsage.ofLimitReset", { limit: formatCount(window.limit, locale), reset: window.reset })
      : t("aiUsage.ofLimit", { limit: formatCount(window.limit, locale) }),
  };
}

/** Settings › Usage: how much the translation service has left, as last reported. */
export function AiUsageDashboard({ llmUsage }: AiUsageDashboardProps) {
  const { locale } = useI18n();
  const t = useT();
  const provider = llmUsage.providerRateLimit;
  const requests = remaining(provider?.requestsPerDay ?? null, locale, t);
  const tokens = remaining(provider?.tokensPerMinute ?? null, locale, t);
  return (
    <SettingGroup
      title={t("aiUsage.title")}
      hint={provider
        ? t("aiUsage.hintReported", { observedAt: formatObservedAt(new Date(provider.observedAt), locale) })
        : t("aiUsage.hintNoReport")}
    >
      <div className="statTiles">
        <div className="statTile"><span>{t("aiUsage.requestsLeft")}</span><strong>{requests.value}</strong><small>{requests.detail}</small></div>
        <div className="statTile"><span>{t("aiUsage.tokensLeft")}</span><strong>{tokens.value}</strong><small>{tokens.detail}</small></div>
      </div>
      <p className="settingHint">
        {t("aiUsage.capHint", { tokens: MAX_TRANSLATION_COMPLETION_TOKENS })}
      </p>
    </SettingGroup>
  );
}
