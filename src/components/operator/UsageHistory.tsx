"use client";
import { useEffect, useState } from "react";
import { experienceRequest } from "@/experience/client";
import type { UsageRecord } from "@/experience/contracts";
import { SettingGroup } from "@/components/operator/SettingsParts";

export function UsageHistory() {
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [message, setMessage] = useState("Loading…");
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
    setBusy(true); setMessage("Loading usage…");
    try {
      let after: string | null = "";
      const rows = new Map<string, UsageRecord>();
      for (let page = 0; after !== null && page < 100; page++) {
        const result: { records: UsageRecord[]; next: string | null } = await experienceRequest(`usage?after=${encodeURIComponent(after)}`);
        for (const row of result.records) rows.set(row.id, row);
        after = result.next;
      }
      setRecords([...rows.values()]); setMessage(after ? "Showing part of the last 30 days; the rest didn’t load." : "Up to date. Calls whose outcome is unconfirmed aren’t in the token totals.");
    } catch (error) {
      setMessage(error instanceof Error && !(error instanceof SyntaxError) && !(error instanceof TypeError)
        ? error.message : "Couldn’t load usage. Check the connection, then press Refresh.");
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
  const count = (value: number) => new Intl.NumberFormat().format(value);
  const transcriptions = records.filter((row) => row.stage === "transcription").length;
  const translations = records.filter((row) => row.stage === "translation").length;
  return (
    <SettingGroup title="Last 30 days" hint="Counts survive Clear, End and deleting a sermon; each record expires after 30 days.">
      <div className="statTiles">
        <div className="statTile"><span>Services</span><strong>{count(services.size)}</strong></div>
        <div className="statTile"><span>Transcriptions</span><strong>{count(transcriptions)}</strong></div>
        <div className="statTile"><span>Translations</span><strong>{count(translations)}</strong></div>
      </div>
      <div className="buttonRow">
        <button type="button" className="secondaryButton" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Refresh"}</button>
      </div>
      <p className="settingHint" role="status" aria-live="polite">{message}</p>
      <details className="advancedActions">
        <summary>Usage by day (UTC)</summary>
        {days.size === 0 ? <p className="settingHint">Nothing recorded yet.</p> : null}
        {[...days].sort(([first], [second]) => second.localeCompare(first)).map(([date, day]) => (
          <div className="statRow" key={date}><span>{date}</span><span>{count(day.calls)} calls · {count(day.tokens)} tokens{day.unknown ? ` · ${count(day.unknown)} unconfirmed` : ""}</span></div>
        ))}
      </details>
      <details className="advancedActions">
        <summary>Usage by service</summary>
        {services.size === 0 ? <p className="settingHint">Nothing recorded yet.</p> : null}
        {[...services].sort(([, first], [, second]) => second.at - first.at).map(([id, service]) => (
          <div className="statRow" key={id}>
            <span>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(service.at)}</span>
            <span>{count(service.calls)} calls · {count(service.tokens)} tokens{service.unknown ? ` · ${count(service.unknown)} unconfirmed` : ""}</span>
          </div>
        ))}
      </details>
      <details className="advancedActions">
        <summary>Usage by AI service</summary>
        {groups.size === 0 ? <p className="settingHint">Nothing recorded yet.</p> : null}
        {[...groups].map(([name, group]) => (
          <div className="statRow" key={name}>
            <span translate="no">{name}</span>
            <span>{count(group.calls)} calls · {count(group.tokens)} tokens · {count(Math.round(group.seconds / 60))} audio min{group.unknown ? ` · ${count(group.unknown)} unconfirmed` : ""}</span>
          </div>
        ))}
      </details>
    </SettingGroup>
  );
}
