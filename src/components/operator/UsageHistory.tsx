"use client";
import { useState } from "react";
import { experienceRequest } from "@/experience/client";
import type { UsageRecord } from "@/experience/contracts";

export function UsageHistory() {
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [message, setMessage] = useState("Load usage recorded across services in the last 30 days.");
  const [busy, setBusy] = useState(false);
  const [chunkSeconds, setChunkSeconds] = useState(9);
  const [serviceMinutes, setServiceMinutes] = useState(90);
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
      setRecords([...rows.values()]); setMessage(after ? "Partial usage report. Export or narrow the period before estimating capacity." : "Usage updated. Unknown consumption is excluded from known totals.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load usage."); }
    finally { setBusy(false); }
  }
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
  const sample = records.filter((row) => row.stage === "translation" && row.provider === "groq" && row.model === "openai/gpt-oss-20b");
  const meanTokens = sample.length && sample.every((row) => row.status === "completed" && row.tokens)
    ? sample.reduce((sum, row) => sum + row.tokens!.totalTokens, 0) / sample.length : null;
  const callsPerService = Math.ceil(serviceMinutes * 60 / chunkSeconds);
  const withinMinuteLimits = meanTokens !== null && meanTokens * 60 / chunkSeconds <= 8000 && 60 / chunkSeconds <= 20;
  const servicesPerDay = meanTokens && withinMinuteLimits ? Math.max(0, Math.floor(Math.min(
    1000 / callsPerService, 200000 / (meanTokens * callsPerService), 28800 / (serviceMinutes * 60),
  ))) : null;
  const count = (value: number) => new Intl.NumberFormat().format(value);
  return <section className="experienceCard" aria-labelledby="usage-history-heading">
    <h3 id="usage-history-heading">Last 30 days</h3>
    <p>Numeric usage survives Clear, End, and sermon deletion. Records expire individually after 30 days. Provider quota resets separately.</p>
    <button className="secondaryButton" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Load usage history"}</button>
    <p role="status" aria-live="polite">{message}</p>
    {records.length > 0 && <p><strong>{count(records.length)} attempts across {count(services.size)} services</strong></p>}
    {[...groups].map(([name, group]) => <article className="usageHistoryRow" key={name}><h4>{name}</h4>
      <p>{count(group.calls)} attempts · {count(group.tokens)} known tokens · {count(group.seconds / 60)} known audio minutes</p>
      <p>{count(group.unknown)} unresolved attempts · {count(group.neurons)} estimated neurons</p></article>)}
    <details><summary>Usage by day (UTC)</summary>{[...days].sort(([a], [b]) => b.localeCompare(a)).map(([date, day]) =>
      <article className="usageHistoryRow" key={date}><h4>{date}</h4><p>{count(day.calls)} attempts · {count(day.tokens)} known tokens · {count(day.unknown)} unresolved</p></article>)}</details>
    <details><summary>Usage by service</summary>{[...services].sort(([, a], [, b]) => b.at - a.at).map(([id, service]) =>
      <article className="usageHistoryRow" key={id}><h4>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(service.at)}</h4>
        <p>{count(service.calls)} attempts · {count(service.tokens)} known tokens · {count(service.unknown)} unresolved</p></article>)}</details>
    <details><summary>Plan monthly service capacity</summary>
      <p>Estimate for Groq gpt-oss-20b and Whisper Turbo using this app’s observed average translation tokens. Every audio chunk is assumed to need translation.</p>
      <div className="fieldGrid"><label>Service minutes<input name="capacityMinutes" autoComplete="off" inputMode="numeric" type="number" min={1} max={90} value={serviceMinutes} onChange={(event) => setServiceMinutes(Math.max(1, Math.min(90, Number(event.target.value) || 1)))} /></label>
        <label>Audio chunk seconds<select name="capacityChunk" value={chunkSeconds} onChange={(event) => setChunkSeconds(Number(event.target.value))}><option value={6}>6</option><option value={9}>9</option><option value={12}>12</option><option value={15}>15</option><option value={18}>18</option></select></label></div>
      <p>{servicesPerDay === null ? "Estimate unavailable: load complete usage for the default translation model, or reduce the token rate." :
        `Theoretical ceiling: ${servicesPerDay} complete services per day, or ${servicesPerDay * 30} across 30 separate days. About ${callsPerService} transcription and ${callsPerService} translation calls per service, averaging ${Math.round(meanTokens!)} tokens per translation.`}</p>
      <p className="helpText">Assumes published free limits of 1,000 translation requests and 200,000 translation tokens per day, 8,000 translation tokens per minute, and 28,800 audio seconds per day. This is a planning ceiling, not your remaining allowance. Account limits, other apps, speech, pauses and prompts change capacity. Reader and summary use a separate Cloudflare budget. <a href="https://console.groq.com/docs/rate-limits" target="_blank" rel="noreferrer">Verify your Groq limits</a>.</p>
    </details>
    <p className="helpText">Monthly service capacity depends on each provider’s daily and shorter limits. Unknown consumption and other apps sharing the account prevent an exact remaining allowance.</p>
  </section>;
}
