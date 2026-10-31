"use client";
import { useEffect, useState } from "react";
import { experienceRequest } from "@/experience/client";
import type { UsageRecord } from "@/experience/contracts";
import { SettingGroup } from "@/components/operator/SettingsParts";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/provider";

type UsageMessage = { key: MessageKey } | { text: string };

export function UsageHistory() {
  const { locale, t } = useI18n();
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [message, setMessage] = useState<UsageMessage>({ key: "common.loading" });
  const [busy, setBusy] = useState(false);
  const groups = new Map<string, { calls: number; tokens: number; seconds: number; unknown: number; neurons: number }>();
  for (const record of records) {
    const key = `${record.provider} · ${record.stage} · ${record.model}`;
    const group = groups.get(key) ?? { calls: 0, tokens: 0, seconds: 0, unknown: 0, neurons: 0 };
    group.calls++; group.tokens += record.tokens?.totalTokens ?? 0; group.seconds += record.audioSeconds ?? 0;
    group.neurons += record.estimatedNeurons; if (record.status !== "completed") group.unknown++;
    groups.set(key, group);
  }
  async function load() {
    setBusy(true); setMessage({ key: "usage.loading" });
    try {
      let after: string | null = "";
      const rows = new Map<string, UsageRecord>();
      for (let page = 0; after !== null && page < 100; page++) {
        const result: { records: UsageRecord[]; next: string | null } = await experienceRequest(`usage?after=${encodeURIComponent(after)}`);
        for (const row of result.records) rows.set(row.id, row);
        after = result.next;
      }
      setRecords([...rows.values()]); setMessage({ key: after ? "usage.partial" : "usage.upToDate" });
    } catch (error) {
      setMessage(error instanceof Error && !(error instanceof SyntaxError) && !(error instanceof TypeError)
        ? { text: error.message } : { key: "usage.loadFailed" });
    }
    finally { setBusy(false); }
  }
  useEffect(() => {
    // Previous services are already in the 30-day ledger; show them without a click.
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, []);
  const services = new Map<string, { at: number; calls: number; tokens: number; unknown: number }>();
  const days = new Map<string, { calls: number; tokens: number; unknown: number }>();
  for (const row of records) {
    const service = services.get(row.serviceId) ?? { at: row.at, calls: 0, tokens: 0, unknown: 0 };
    service.at = Math.min(service.at, row.at); service.calls++; service.tokens += row.tokens?.totalTokens ?? 0;
    service.unknown += Number(row.status !== "completed"); services.set(row.serviceId, service);
    const date = new Date(row.at).toISOString().slice(0, 10);
    const day = days.get(date) ?? { calls: 0, tokens: 0, unknown: 0 };
    day.calls++; day.tokens += row.tokens?.totalTokens ?? 0; day.unknown += Number(row.status !== "completed"); days.set(date, day);
  }
  const count = (value: number) => new Intl.NumberFormat(locale).format(value);
  const transcriptions = records.filter((row) => row.stage === "transcription").length;
  const translations = records.filter((row) => row.stage === "translation").length;
  const countsLine = (calls: number, tokens: number, unknown: number) => unknown
    ? t("usage.countsUnconfirmed", { calls: count(calls), tokens: count(tokens), unknown: count(unknown) })
    : t("usage.counts", { calls: count(calls), tokens: count(tokens) });
  const audioCountsLine = (calls: number, tokens: number, seconds: number, unknown: number) => unknown
    ? t("usage.countsAudioUnconfirmed", {
      calls: count(calls),
      tokens: count(tokens),
      minutes: count(Math.round(seconds / 60)),
      unknown: count(unknown),
    })
    : t("usage.countsAudio", {
      calls: count(calls),
      tokens: count(tokens),
      minutes: count(Math.round(seconds / 60)),
    });
  return (
    <SettingGroup title={t("usage.title")} hint={t("usage.hint")}>
      <div className="statTiles">
        <div className="statTile"><span>{t("usage.services")}</span><strong>{count(services.size)}</strong></div>
        <div className="statTile"><span>{t("usage.transcriptions")}</span><strong>{count(transcriptions)}</strong></div>
        <div className="statTile"><span>{t("usage.translations")}</span><strong>{count(translations)}</strong></div>
      </div>
      <div className="buttonRow">
        <button type="button" className="secondaryButton" disabled={busy} onClick={() => void load()}>{busy ? t("common.loading") : t("common.refresh")}</button>
      </div>
      <p className="settingHint" role="status" aria-live="polite">{"text" in message ? message.text : t(message.key)}</p>
      <details className="advancedActions">
        <summary>{t("usage.byDay")}</summary>
        {days.size === 0 ? <p className="settingHint">{t("usage.nothing")}</p> : null}
        {[...days].sort(([first], [second]) => second.localeCompare(first)).map(([date, day]) => (
          <div className="statRow" key={date}><span>{date}</span><span>{countsLine(day.calls, day.tokens, day.unknown)}</span></div>
        ))}
      </details>
      <details className="advancedActions">
        <summary>{t("usage.byService")}</summary>
        {services.size === 0 ? <p className="settingHint">{t("usage.nothing")}</p> : null}
        {[...services].sort(([, first], [, second]) => second.at - first.at).map(([id, service]) => (
          <div className="statRow" key={id}>
            <span>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(service.at)}</span>
            <span>{countsLine(service.calls, service.tokens, service.unknown)}</span>
          </div>
        ))}
      </details>
      <details className="advancedActions">
        <summary>{t("usage.byAiService")}</summary>
        {groups.size === 0 ? <p className="settingHint">{t("usage.nothing")}</p> : null}
        {[...groups].map(([name, group]) => (
          <div className="statRow" key={name}>
            <span translate="no">{name}</span>
            <span>{audioCountsLine(group.calls, group.tokens, group.seconds, group.unknown)}</span>
          </div>
        ))}
      </details>
    </SettingGroup>
  );
}
