"use client";
import { useI18n } from "@/i18n/provider";
import type { RecentOutput } from "@/live/recent-outputs";

export function RecentOutputsStrip({ outputs }: { outputs: readonly RecentOutput[] }) {
  const { locale, t } = useI18n();
  return <section className="recentOutputs" aria-label={t("recentOutputs.title")}>
    <h3>{t("recentOutputs.title")}</h3>
    {!outputs.length ? <p className="settingHint">{t("recentOutputs.empty")}</p> : <ol>
      {outputs.map((entry) => <li key={entry.id}>
        <time dateTime={new Date(entry.at).toISOString()}>{new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(entry.at)}</time>
        {entry.hidden ? <p>{t("recentOutputs.hidden")}</p> : <p>{entry.publicText}</p>}
        <p className="settingHint">{entry.sourceText}</p>
      </li>)}
    </ol>}
    <p className="settingHint">{t("recentOutputs.hint")}</p>
  </section>;
}
