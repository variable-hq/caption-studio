import { afterEach, describe, expect, it, vi } from "vitest";
import { SermonJournal, parseSummary } from "./sermon-journal";
import { AiUsageLedger } from "./usage-ledger";
import { DAY, HISTORY_RETENTION, READER_GRACE, SUMMARY_MODELS, type ExperienceEnvironment, type JournalState, type Namespace, type UsageRecord } from "./contracts";
import { CaptionRoom, captionTokenHash } from "@/live/caption-room";
import { normalizeCaptionStyle } from "@/live/contracts";
import { handleExperienceRequest } from "./api";
import { correctApprovedRecognitionVariants } from "@/pipeline/bible-terms";
import { parseGlossaryInput } from "@/live/config";
import { buildTranscriptionPrompt } from "@/ai/server/groq";

class Storage {
  values = new Map<string, unknown>();
  alarmAt: number | null = null;
  async get<T>(key: string) { return structuredClone(this.values.get(key)) as T | undefined; }
  async put(key: string, value: unknown) { this.values.set(key, structuredClone(value)); }
  async delete(keys: string | string[]) { for (const key of [keys].flat()) this.values.delete(key); }
  async deleteAll() { this.values.clear(); }
  async list<T>({ prefix = "", startAfter = "", limit = Infinity } = {}) {
    return new Map([...this.values].filter(([key]) => key.startsWith(prefix) && key > startAfter).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit)) as Map<string, T>;
  }
  async setAlarm(at: number) { this.alarmAt = at; }
  async getAlarm() { return this.alarmAt; }
  async deleteAlarm() { this.alarmAt = null; }
  private tail = Promise.resolve();
  async transaction<T>(work: (storage: Storage) => Promise<T>): Promise<T> {
    const previous = this.tail; let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous; try { return await work(this); } finally { release(); }
  }
}
function state(storage: Storage) {
  let tail = Promise.resolve();
  return { storage, getWebSockets: () => [], blockConcurrencyWhile: async <T>(work: () => Promise<T>) => {
    const before = tail; let release!: () => void;
    tail = new Promise<void>((resolve) => { release = resolve; }); await before;
    try { return await work(); } finally { release(); }
  } } as unknown as DurableObjectState;
}
function request(path: string, body?: unknown, headers?: HeadersInit) {
  return new Request(`https://internal${path}`, { method: body === undefined ? "GET" : "POST",
    headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const id = "12345678-1234-1234-1234-123456789012";
const readerHash = "a".repeat(64);
function snapshot(saved = true): JournalState {
  return { id, startedAt: Date.now(), expiresAt: Date.now() + 90 * 60_000,
    saved, readerHash, status: "live", epoch: 0, revision: 0, incomplete: false,
    readerCalls: 0, summaryCalls: 0 };
}
const input = (id: number, text = "Synthetic translated sermon.", epoch = 0) => ({
  id, publicText: text, targetLanguage: "en", epoch, translationRevision: 1, filterText: "", keywordText: "",
});
async function fixture(saved = true, env: ExperienceEnvironment = {}) {
  const storage = new Storage(); const journal = new SermonJournal(state(storage), env);
  const initial = snapshot(saved); await journal.fetch(request("/sync", initial));
  return { storage, journal, initial };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("TB2 terminology", () => {
  it("corrects only explicitly approved whole-word variants", () => {
    const terms = parseGlossaryInput("Saul|swauf => Saul", "en");
    expect(correctApprovedRecognitionVariants("swauf, swaufish and Saul", terms)).toBe("Saul, swaufish and Saul");
    expect(correctApprovedRecognitionVariants("swauf", parseGlossaryInput("Saul => Saul", "en"))).toBe("swauf");
  });
  it("keeps multilingual transcription hints inside a conservative byte budget", () => {
    const prompt = buildTranscriptionPrompt(["Saul", ...Array(40).fill("非常長的名字")], "id");
    expect(prompt).toContain("Khotbah"); expect(prompt).toContain("Saul");
    expect(new TextEncoder().encode(prompt).length).toBeLessThanOrEqual(224);
  });
});

describe("sermon journals", () => {
  it("persists source only after opt-in and keeps unsaved text out of durable storage", async () => {
    const { journal, storage } = await fixture(false);
    await journal.fetch(request("/source", { id: 1, text: "Synthetic private source", language: "id", translationRevision: 1 }));
    await journal.fetch(request("/append", input(1, "Synthetic public text")));
    expect(JSON.stringify([...storage.values])).not.toContain("Synthetic");
    await journal.alarm();
    expect(JSON.stringify([...storage.values])).not.toContain("Synthetic");
    const result = await journal.fetch(request("/read", undefined, { "x-reader-hash": readerHash }));
    expect(await result.json()).toMatchObject({ saved: false, paragraphs: [{ text: "Synthetic public text", fallback: true }] });
    const evicted = new SermonJournal(state(storage), {});
    expect(await (await evicted.fetch(request("/read", undefined, { "x-reader-hash": readerHash }))).json()).toMatchObject({ paragraphs: [] });
  });
  it("Clear preserves committed paragraphs and rejects old pending material", async () => {
    const { journal, initial } = await fixture();
    await journal.fetch(request("/append", input(1, "Committed"))); await journal.alarm();
    await journal.fetch(request("/append", input(2, "Discarded draft")));
    await journal.fetch(request("/sync", { ...initial, epoch: 1 }));
    await journal.fetch(request("/append", input(3, "Late old result", 0))); await journal.alarm();
    const body = await (await journal.fetch(request("/read", undefined, { "x-reader-hash": readerHash }))).json();
    expect(body).toMatchObject({ paragraphs: [{ text: "Committed" }] });
    expect(JSON.stringify(body)).not.toMatch(/Discarded|Late old/);
  });
  it("reapplies public filters to fallback and avoids duplicate paragraphs", async () => {
    const { journal } = await fixture();
    const segment = { ...input(1, "privateword and approved speech"), filterText: "privateword" };
    await journal.fetch(request("/append", segment)); await journal.fetch(request("/append", segment)); await journal.alarm();
    const body = await (await journal.fetch(request("/read", undefined, { "x-reader-hash": readerHash }))).json() as { paragraphs: unknown[] };
    expect(body.paragraphs).toHaveLength(1); expect(JSON.stringify(body)).not.toContain("privateword");
  });
  it("moderates a whole batch using every input's own filter list, not just the first", async () => {
    const { journal } = await fixture();
    await journal.fetch(request("/append", { ...input(1, "say badword now"), filterText: "" }));
    await journal.fetch(request("/append", { ...input(2, "say badword now"), filterText: "badword" }));
    await journal.alarm();
    const body = await (await journal.fetch(request("/read", undefined, { "x-reader-hash": readerHash }))).json();
    expect(JSON.stringify(body)).not.toContain("badword");
  });
  it("removes a passage, excludes its source, and invalidates derived summaries", async () => {
    const { journal, storage } = await fixture();
    await journal.fetch(request("/source", { id: 1, text: "Private original", language: "id", translationRevision: 1 }));
    await journal.fetch(request("/append", input(1))); await journal.alarm();
    await storage.put("summary", { status: "completed", result: [] });
    await journal.fetch(request("/remove", { id: 1 }));
    const body = await (await journal.fetch(request("/archive"))).json() as { summary: unknown; sources: unknown[] };
    expect(body.summary).toBeNull(); expect(body.sources).toEqual([expect.objectContaining({ text: "Private original", excluded: true })]);
  });
  it("revokes reader access after grace while retaining private source for seven days", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T00:00:00Z"));
    const { journal, initial } = await fixture();
    await journal.fetch(request("/sync", { ...initial, status: "ended", endedAt: Date.now() }));
    vi.advanceTimersByTime(READER_GRACE);
    expect((await journal.fetch(request("/read", undefined, { "x-reader-hash": readerHash }))).status).toBe(403);
    expect((await journal.fetch(request("/archive"))).status).toBe(200);
    vi.advanceTimersByTime(HISTORY_RETENTION - READER_GRACE);
    expect((await journal.fetch(request("/archive"))).status).toBe(410);
  });
  it("deletion blocks late lifecycle messages from resurrecting content", async () => {
    const { journal, initial, storage } = await fixture();
    await journal.fetch(request("/sync", { ...initial, status: "ended", endedAt: Date.now() }));
    await journal.fetch(request("/delete", {}));
    expect((await journal.fetch(request("/sync", initial))).status).toBe(410);
    expect([...storage.values.keys()]).toEqual(["deleted"]);
  });
  it("requires opt-in and End for summaries, and deduplicates requests", async () => {
    const { journal, initial } = await fixture();
    const options = { requestId: "summary-request-0001", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", language: "id", length: "short", guidance: "" };
    expect((await journal.fetch(request("/summary", options))).status).toBe(409);
    await journal.fetch(request("/sync", { ...initial, status: "ended", endedAt: Date.now() }));
    expect((await journal.fetch(request("/summary", options))).status).toBe(202);
    expect((await journal.fetch(request("/summary", { ...options, requestId: "summary-request-0002" }))).status).toBe(200);
    expect(await (await journal.fetch(request("/archive"))).json()).toMatchObject({ summary: { id: options.requestId, status: "queued" } });
  });
  it("does not replay an interrupted inference job", async () => {
    const { journal, initial, storage } = await fixture();
    await journal.fetch(request("/sync", { ...initial, status: "ended", endedAt: Date.now() }));
    await journal.fetch(request("/summary", { requestId: "summary-request-0001", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", language: "id", length: "short", guidance: "" }));
    await storage.put("summary-flight", { id: "summary-request-0001" }); await journal.alarm();
    expect(await storage.get("summary")).toMatchObject({ status: "failed", error: expect.stringContaining("interrupted") });
  });
  it("rejects fabricated evidence IDs", () => {
    expect(() => parseSummary('{"points":[{"text":"Invented reference","sourceIds":[99]}]}', new Set([1]))).toThrow("unsupported");
    expect(parseSummary('{"points":[{"text":"Supported statement","sourceIds":[1]}]}', new Set([1]))).toHaveLength(1);
  });
});

describe("usage history", () => {
  it("deduplicates accounting, preserves unknown usage and expires without extending retention", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T00:00:00Z"));
    const storage = new Storage(); const ledger = new AiUsageLedger(state(storage));
    const admission = { id: "attempt-1", serviceId: id, stage: "translation", provider: "groq", model: "test-model", reservedNeurons: 0 };
    expect((await ledger.fetch(request("/admit", admission))).status).toBe(200);
    expect((await ledger.fetch(request("/admit", admission))).status).toBe(409);
    const alarm = storage.alarmAt;
    vi.advanceTimersByTime(29 * DAY);
    await ledger.fetch(request("/finish", { id: "attempt-1", status: "unknown" }));
    let history = await (await ledger.fetch(request("/history"))).json() as { records: UsageRecord[] };
    expect(history.records).toHaveLength(1); expect(history.records[0].tokens).toBeNull();
    expect(storage.alarmAt).toBe(alarm);
    await ledger.fetch(request("/finish", { id: "attempt-1", status: "completed", tokens: { promptTokens: 12, completionTokens: 3, totalTokens: 15 } }));
    await ledger.fetch(request("/finish", { id: "attempt-1", status: "completed", tokens: { totalTokens: 99 } }));
    history = await (await ledger.fetch(request("/history"))).json() as { records: UsageRecord[] };
    expect(history.records[0].tokens?.totalTokens).toBe(15);
    vi.advanceTimersByTime(DAY);
    expect(await (await ledger.fetch(request("/history"))).json()).toMatchObject({ records: [] });
    expect((await ledger.fetch(request("/finish", { id: "attempt-1", tokens: { totalTokens: 40 } }))).status).toBe(410);
    await ledger.alarm(); expect(storage.values.size).toBe(0);
  });
  it("reserves separate reader headroom and rejects work before exceeding the daily budget", async () => {
    const ledger = new AiUsageLedger(state(new Storage()));
    const admission = { id: "reader-1", serviceId: id, stage: "reader", provider: "cloudflare", model: "test", reservedNeurons: 6000 };
    expect((await ledger.fetch(request("/admit", admission))).status).toBe(200);
    expect((await ledger.fetch(request("/admit", { ...admission, id: "reader-2", reservedNeurons: 1 }))).status).toBe(429);
    expect((await ledger.fetch(request("/admit", { ...admission, id: "summary-1", stage: "summary", reservedNeurons: 3000 }))).status).toBe(200);
    expect((await ledger.fetch(request("/admit", { ...admission, id: "summary-2", stage: "summary", reservedNeurons: 1 }))).status).toBe(429);
  });
});

describe("remote control and clear boundaries", () => {
  async function fixture() {
    const storage = new Storage();
    const journals = new Map<string, SermonJournal>();
    const namespace: Namespace = { idFromName: (name) => name, get: (key) => {
      const name = String(key); if (!journals.has(name)) journals.set(name, new SermonJournal(state(new Storage()), {}));
      return journals.get(name)!;
    } };
    const room = new CaptionRoom(state(storage), { SERMON_JOURNALS: namespace });
    const controllerHash = "b".repeat(64);
    await room.fetch(request("/internal/channel", { tokenHash: "c".repeat(64), encryptedToken: "synthetic" }));
    const started = await room.fetch(request("/internal/service", { controllerHash, viewerTokenHash: "d".repeat(64), readerHash, saveHistory: true, takeover: false }));
    expect(started.status).toBe(200);
    const details = await storage.get<{ serviceId: string }>("configuration");
    return { room, storage, controllerHash, serviceId: details!.serviceId };
  }
  it("rejects an old caption after Clear and accepts the new lease boundary", async () => {
    const { room, controllerHash } = await fixture();
    await room.fetch(request("/internal/control", { controllerHash, action: "clear" }));
    const caption = { controllerHash, publicText: "Synthetic", targetLanguage: "en", style: normalizeCaptionStyle({}), translationRevision: 1, captionEpoch: 0 };
    expect(await (await room.fetch(request("/internal/caption", caption))).json()).toMatchObject({ code: "caption_cleared" });
    const lease = await (await room.fetch(request("/internal/lease", { controllerHash }))).json() as { captionEpoch: number };
    expect((await room.fetch(request("/internal/caption", { ...caption, captionEpoch: lease.captionEpoch }))).status).toBe(200);
  });
  it("pauses server inference immediately, deduplicates a remote command, and checks microphone acknowledgement", async () => {
    const { room, controllerHash, serviceId } = await fixture();
    const remoteHash = "e".repeat(64);
    await room.fetch(request("/internal/experience/pair", { controllerHash, remoteHash }));
    const command = { serviceId, remoteHash, id: "remote-command-0001", action: "pause" };
    expect((await room.fetch(request("/internal/experience/remote", command))).status).toBe(200);
    expect(await (await room.fetch(request("/internal/lease", { controllerHash }))).json()).toMatchObject({ code: "service_paused" });
    const first = await (await room.fetch(request("/internal/experience/remote", command))).json();
    expect(first).toMatchObject({ command: { status: "pending" }, connected: false });
    await room.fetch(request("/internal/experience/host", { controllerHash, acknowledgement: command.id, capturing: true, success: true }));
    expect(await (await room.fetch(request("/internal/experience/remote", { serviceId, remoteHash }))).json()).toMatchObject({ command: { status: "failed" } });
    await room.fetch(request("/internal/experience/host", { controllerHash, acknowledgement: command.id, capturing: false, success: true }));
    expect(await (await room.fetch(request("/internal/experience/remote", { serviceId, remoteHash }))).json()).toMatchObject({ command: { status: "confirmed" } });
  });
  it("rejects disconnected Resume and old pairing after takeover", async () => {
    const { room, controllerHash, serviceId } = await fixture(); const remoteHash = "e".repeat(64);
    await room.fetch(request("/internal/experience/pair", { controllerHash, remoteHash }));
    expect((await room.fetch(request("/internal/experience/remote", { serviceId, remoteHash, id: "remote-resume-0001", action: "resume" }))).status).toBe(409);
    await room.fetch(request("/internal/service", { controllerHash: "f".repeat(64), viewerTokenHash: "d".repeat(64), readerHash, takeover: true }));
    expect((await room.fetch(request("/internal/experience/remote", { serviceId, remoteHash }))).status).toBe(403);
  });
  it("keeps operator archive and remote APIs Access-protected", async () => {
    const env = { CAPTION_ROOMS: { idFromName: () => "", get: () => ({ fetch: vi.fn() }) } };
    const response = await handleExperienceRequest(request(`/api/live/experience/sermons/${id}/archive`), env);
    expect(response?.status).not.toBe(200);
    expect(await captionTokenHash("reader-token")).toHaveLength(64);
  });
});

function optionalEnvironment(run: NonNullable<ExperienceEnvironment["AI"]>["run"]) {
  const ledger = new AiUsageLedger(state(new Storage()));
  return { CAPTION_OPTIONAL_AI_ENABLED: "true", AI: { run }, AI_USAGE: {
    idFromName: (name: string) => name, get: () => ledger,
  } } satisfies ExperienceEnvironment;
}
const summaryOptions = { requestId: "summary-request-1001", model: SUMMARY_MODELS[1], language: "id", length: "short", guidance: "" };

describe("experience recovery", () => {
  it("falls back after an interrupted reader call without spending again", async () => {
    const run = vi.fn();
    const { journal, initial, storage } = await fixture(true, optionalEnvironment(run));
    await storage.put("reader-flight", { snapshot: initial, inputs: [input(1, "Recovered public text")] });
    await journal.alarm();
    expect(run).not.toHaveBeenCalled();
    expect(await storage.get("paragraph:000001")).toMatchObject({ text: "Recovered public text", fallback: true });
    expect(await storage.get("reader-flight")).toBeUndefined();
  });
  it("discards reader output when Clear arrives during inference", async () => {
    let resolve!: (value: unknown) => void;
    let started!: () => void;
    const ready = new Promise<void>((r) => { started = r; });
    const run = vi.fn(() => { started(); return new Promise((r) => { resolve = r; }); });
    const { journal, initial, storage } = await fixture(true, optionalEnvironment(run));
    await journal.fetch(request("/append", input(1))); const alarm = journal.alarm();
    await ready;
    await journal.fetch(request("/sync", { ...initial, epoch: 1 }));
    resolve({ response: "Late synthetic output", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
    await alarm;
    expect(await storage.get("paragraph:000001")).toBeUndefined();
    expect(await storage.get("reader-flight")).toBeUndefined();
  });
  it("falls back to the naive join when the reader response looks unsafe", async () => {
    const run = vi.fn(async () => ({ response: "As an AI language model, I cannot join those captions.",
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }));
    const { journal, storage } = await fixture(true, optionalEnvironment(run));
    await journal.fetch(request("/append", input(1, "Grace and peace")));
    await journal.alarm();
    expect(run).toHaveBeenCalledOnce();
    expect(await storage.get("paragraph:000001")).toMatchObject({ text: "Grace and peace", fallback: true });
  });
  it("fails a summary job when the response looks unsafe", async () => {
    const run = vi.fn(async () => ({ response: "--- BEGIN OPERATOR SUMMARY GUIDANCE (JSON STRING) --- leaked",
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }));
    const { journal, initial, storage } = await fixture(true, optionalEnvironment(run));
    await journal.fetch(request("/source", { id: 1, text: "Synthetic source", language: "id", translationRevision: 1 }));
    await journal.fetch(request("/sync", { ...initial, endedAt: Date.now(), status: "ended" }));
    await journal.fetch(request("/summary", summaryOptions));
    await journal.alarm(); await journal.alarm();
    expect(await storage.get("summary")).toMatchObject({ status: "failed" });
  });
  it("generates a manual summary in bounded section and synthesis calls", async () => {
    const run = vi.fn(async () => ({ response: JSON.stringify({ points: [{ text: "Synthetic supported point", sourceIds: [1] }] }),
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }));
    const { journal, initial, storage } = await fixture(true, optionalEnvironment(run));
    await journal.fetch(request("/source", { id: 1, text: "Synthetic source", language: "id", translationRevision: 1 }));
    await journal.fetch(request("/sync", { ...initial, endedAt: Date.now(), status: "ended" }));
    await journal.fetch(request("/summary", summaryOptions));
    await journal.alarm(); await journal.alarm();
    expect(run).toHaveBeenCalledTimes(2);
    expect(await storage.get("summary")).toMatchObject({ status: "completed", result: [{ sourceIds: [1] }] });
  });
  it("does not recreate deleted content after a summary returns", async () => {
    let resolve!: (value: unknown) => void;
    let started!: () => void;
    const ready = new Promise<void>((r) => { started = r; });
    const { journal, initial, storage } = await fixture(true, optionalEnvironment(() => {
      started(); return new Promise((r) => { resolve = r; });
    }));
    await journal.fetch(request("/source", { id: 1, text: "Synthetic source", language: "id", translationRevision: 1 }));
    await journal.fetch(request("/sync", { ...initial, endedAt: Date.now(), status: "ended" }));
    await journal.fetch(request("/summary", summaryOptions)); const alarm = journal.alarm();
    await ready; await journal.fetch(request("/delete", {}));
    resolve({ response: JSON.stringify({ points: [{ text: "Synthetic point", sourceIds: [1] }] }) });
    await alarm;
    expect([...storage.values.keys()]).toEqual(["deleted"]);
  });
  it("paginates source and paragraph histories independently", async () => {
    const { journal, storage } = await fixture();
    for (let n = 1; n <= 60; n++) {
      await storage.put(`source:${String(n).padStart(6, "0")}`, { id: n, text: "Synthetic source" });
      await storage.put(`paragraph:${String(n * 3).padStart(6, "0")}`, { id: n * 3, text: "Synthetic paragraph" });
    }
    const body = await (await journal.fetch(request("/archive?after=50&paragraphAfter=150"))).json() as { paragraphs: { id: number }[] };
    expect(body).toMatchObject({ sources: [{ id: 51 }, ...Array.from({ length: 9 }, (_, i) => ({ id: 52 + i }))], more: false, moreParagraphs: false });
    expect(body.paragraphs[0].id).toBe(153); expect(body.paragraphs).toHaveLength(10);
  });
  it("releases a failed Start and retries persisted lifecycle synchronization", async () => {
    const storage = new Storage(); let unavailable = true;
    const journal = new SermonJournal(state(new Storage()), {});
    const room = new CaptionRoom(state(storage), { SERMON_JOURNALS: {
      idFromName: (name) => name, get: () => ({ fetch: async (req) => unavailable ? Response.json({}, { status: 503 }) : journal.fetch(req) }),
    } });
    await room.fetch(request("/internal/channel", { tokenHash: "c".repeat(64), encryptedToken: "synthetic" }));
    const body = { controllerHash: "b".repeat(64), viewerTokenHash: "d".repeat(64), readerHash, saveHistory: true, takeover: false };
    expect((await room.fetch(request("/internal/service", body))).status).toBe(503);
    expect(await storage.get("configuration")).toMatchObject({ status: "idle" });
    expect(await storage.get("journal-sync")).toBeDefined();
    unavailable = false;
    // The next request resolves the old lifecycle before accepting more work.
    expect((await room.fetch(request("/internal/channel"))).status).toBe(200);
    expect(await storage.get("journal-sync")).toBeUndefined();
  });
});
