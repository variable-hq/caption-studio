"use client";
import { useEffect, useState } from "react";
import { experienceRequest } from "@/experience/client";
import type { UsageRecord } from "@/experience/contracts";

export function UsageHistory() {
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [message, setMessage] = useState("Loading usage recorded across services in the last 30 days…");
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
      setRecords([...rows.values()]); setMessage(after ? "Showing part of the last 30 days; the rest didn’t load." : "Usage updated. Unknown consumption is excluded from known totals.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load usage."); }
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
  return <section className="experienceCard" aria-labelledby="usage-history-heading">
    <h3 id="usage-history-heading">All services · last 30 days</h3>
    <p>Numeric usage survives Clear, End, and sermon deletion. Records expire individually after 30 days. Provider quota resets separately.</p>
    <button className="secondaryButton" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Refresh usage history"}</button>
    <p role="status" aria-live="polite">{message}</p>
    {records.length > 0 && <p><strong>{count(records.length)} attempts across {count(services.size)} services</strong></p>}
    {[...groups].map(([name, group]) => <article className="usageHistoryRow" key={name}><h4>{name}</h4>
      <p>{count(group.calls)} attempts · {count(group.tokens)} known tokens · {count(group.seconds / 60)} known audio minutes</p>
      <p>{count(group.unknown)} unresolved attempts · {count(group.neurons)} estimated neurons</p></article>)}
    <details><summary>Usage by day (UTC)</summary>{records.length === 0 && <p className="helpText">{busy ? "Loading usage…" : "No usage loaded yet. Choose Refresh usage history to list recorded days."}</p>}{[...days].sort(([a], [b]) => b.localeCompare(a)).map(([date, day]) =>
      <article className="usageHistoryRow" key={date}><h4>{date}</h4><p>{count(day.calls)} attempts · {count(day.tokens)} known tokens · {count(day.unknown)} unresolved</p></article>)}</details>
    <details><summary>Usage by service</summary>{records.length === 0 && <p className="helpText">{busy ? "Loading usage…" : "No usage loaded yet. Choose Refresh usage history to list recorded services."}</p>}{[...services].sort(([, a], [, b]) => b.at - a.at).map(([id, service]) =>
      <article className="usageHistoryRow" key={id}><h4>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(service.at)}</h4>
        <p>{count(service.calls)} attempts · {count(service.tokens)} known tokens · {count(service.unknown)} unresolved</p></article>)}</details>
  </section>;
}
