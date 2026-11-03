import { afterEach, describe, expect, it, vi } from "vitest";
import { SermonJournal, parseSummary } from "./sermon-journal";
import { AiUsageLedger } from "./usage-ledger";
import { DAY, HISTORY_RETENTION, MAX_JOURNAL_NOTES, READER_GRACE, SUMMARY_MODELS, normalizeSessionMetadata, type ExperienceEnvironment, type JournalState, type Namespace, type UsageRecord } from "./contracts";
import { CaptionRoom, captionTokenHash } from "@/live/caption-room";
import { normalizeCaptionStyle } from "@/live/contracts";
import { handleExperienceRequest } from "./api";
import { correctApprovedRecognitionVariants } from "@/pipeline/recognition-variants";
import { parseGlossaryInput } from "@/live/config";
import { buildTranscriptionPrompt } from "@/ai/server/groq";
import { queueAutoSummary } from "./auto-summary";

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
const identityKey = `operator:${"b".repeat(64)}`;
function snapshot(saved = true): JournalState {
  return { id, startedAt: Date.now(), expiresAt: Date.now() + 90 * 60_000,
    saved, readerHash, status: "live", epoch: 0, revision: 0, incomplete: false,
    readerCalls: 0, summaryCalls: 0 };
}
const input = (id: number, text = "Synthetic translated sermon.", epoch = 0) => ({
  id, publicText: text, targetLanguage: "en", epoch, translationRevision: 1, filterText: "", keywordText: "",
});
const note = (id: number, text = "Synthetic operator note.") => ({ id, text, targetLanguage: "en" });
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
  it("keeps multilingual transcription hints inside the expanded byte budget", () => {
    const prompt = buildTranscriptionPrompt(["Saul", ...Array(40).fill("非常長的名字")], "id");
    expect(prompt).toContain("Rekaman ucapan"); expect(prompt).toContain("Saul");
    expect(new TextEncoder().encode(prompt).length).toBeLessThanOrEqual(448);
  });
});

describe("sermon journals", () => {
  it("normalizes and bounds record-only session metadata", () => {
    expect(normalizeSessionMetadata({ topic: "  Topic ", speaker: "x".repeat(130), description: "bad\u0000text", sessionAt: -1 })).toEqual({ topic: "Topic", speaker: "x".repeat(120), description: "", sessionAt: null });
    expect(normalizeSessionMetadata({ topic: "y".repeat(150), description: "d".repeat(1200), sessionAt: 42 })).toMatchObject({ topic: "y".repeat(120), description: "d".repeat(1000), sessionAt: 42 });
  });
  it("stores metadata separately, includes it in the archive and preserves service expiry", async () => {
    const { journal, storage } = await fixture();
    const stateBeforeEnd = (await storage.get<JournalState>("state"))!;
    const endedAt = Date.now();
    await journal.fetch(request("/sync", { ...stateBeforeEnd, status: "ended", endedAt }));
    const expiry = (await storage.get<JournalState>("state"))!.expiresAt;
    const response = await journal.fetch(request("/metadata", { topic: "Synthetic topic", speaker: "Synthetic speaker", description: "Record only", sessionAt: 123 }));
    expect(await response.json()).toMatchObject({ metadata: { topic: "Synthetic topic", sessionAt: 123 } });
    expect(await (await journal.fetch(new Request("https://internal/metadata"))).json()).toMatchObject({ metadata: { topic: "Synthetic topic" } });
    const archive = await (await journal.fetch(request("/archive"))).json() as { metadata: unknown };
    expect(archive.metadata).toMatchObject({ topic: "Synthetic topic" });
    expect((await storage.get<JournalState>("state"))!.expiresAt).toBe(expiry);
    expect(await storage.get("metadata")).toMatchObject({ description: "Record only" });
  });
  it("rejects metadata for unsaved sessions and clears it on delete", async () => {
    const unsaved = await fixture(false);
    expect((await unsaved.journal.fetch(request("/metadata", { topic: "Not retained" }))).status).toBe(409);
    const saved = await fixture();
    await saved.journal.fetch(request("/metadata", { topic: "Synthetic topic" }));
    await saved.storage.put("summary", { status: "completed", result: [{ text: "Synthetic summary" }] });
    await saved.storage.put("source:000001", { id: 1, text: "Synthetic source" });
    await saved.journal.fetch(request("/sync", { ...saved.initial, status: "ended", endedAt: Date.now() }));
    await saved.journal.fetch(request("/delete", { confirm: true }));
    expect(await saved.storage.get("metadata")).toBeUndefined();
    expect([...saved.storage.values.keys()]).toEqual(["deleted"]);
  });
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
  it("archives an operator note separately from batched reader paragraphs", async () => {
    const { journal, storage } = await fixture();
    await journal.fetch(request("/append", input(1, "Committed paragraph"))); await journal.alarm();
    await journal.fetch(request("/note", note(1, "We will resume after the offering.")));
    const read = await (await journal.fetch(request("/read", undefined, { "x-reader-hash": readerHash }))).json();
    expect(read).toMatchObject({
      paragraphs: [{ text: "Committed paragraph" }],
      notes: [{ text: "We will resume after the offering." }],
    });
    const archive = await (await journal.fetch(request("/archive"))).json();
    expect(archive).toMatchObject({ notes: [{ text: "We will resume after the offering." }] });
    expect(JSON.stringify([...storage.values])).toContain("We will resume after the offering.");
  });
  it("keeps an unsaved note in memory only and exposes just the latest one", async () => {
    const { journal, storage } = await fixture(false);
    await journal.fetch(request("/note", note(1, "First note")));
    await journal.fetch(request("/note", note(2, "Second note")));
    expect(JSON.stringify([...storage.values])).not.toContain("First note");
    const read = await (await journal.fetch(request("/read", undefined, { "x-reader-hash": readerHash }))).json();
    expect(read).toMatchObject({ notes: [{ text: "Second note" }] });
  });
  it("rejects invalid or duplicate notes and ignores notes after End", async () => {
    const { journal, initial } = await fixture();
    expect((await journal.fetch(request("/note", { id: 1, text: "  ", targetLanguage: "en" }))).status).toBe(400);
    expect((await journal.fetch(request("/note", { id: 1, text: "x".repeat(2001), targetLanguage: "en" }))).status).toBe(400);
    expect(await (await journal.fetch(request("/note", note(1, "First")))).json()).toMatchObject({ accepted: true });
    expect(await (await journal.fetch(request("/note", note(1, "Duplicate")))).json()).toMatchObject({ duplicate: true });
    await journal.fetch(request("/sync", { ...initial, status: "ended", endedAt: Date.now() }));
    expect(await (await journal.fetch(request("/note", note(2, "Too late")))).json()).toMatchObject({ ignored: true });
  });
  it("caps stored operator notes and keeps rejecting once the limit is reached", async () => {
    const { journal } = await fixture();
    for (let id = 1; id <= MAX_JOURNAL_NOTES; id++) {
      expect(await (await journal.fetch(request("/note", note(id, `Note ${id}`)))).json()).toMatchObject({ accepted: true });
    }
    expect((await journal.fetch(request("/note", note(MAX_JOURNAL_NOTES + 1, "One too many")))).status).toBe(409);
    const read = await (await journal.fetch(request("/read", undefined, { "x-reader-hash": readerHash }))).json() as { notes: unknown[] };
    expect(read.notes).toHaveLength(MAX_JOURNAL_NOTES);
  });
  it("flushes trailing pending speech before a note so timestamps stay in speech order", async () => {
    const { journal } = await fixture();
    await journal.fetch(request("/append", input(1, "Trailing words before the pause")));
    await journal.fetch(request("/note", note(2, "We will resume after the offering.")));
    const read = await (await journal.fetch(request("/read", undefined, { "x-reader-hash": readerHash }))).json() as {
      paragraphs: { at: number; text: string }[]; notes: { at: number; text: string }[];
    };
    expect(read.paragraphs).toMatchObject([{ text: "Trailing words before the pause" }]);
    expect(read.paragraphs[0].at).toBeLessThanOrEqual(read.notes[0].at);
  });
  it("revokes reader access after grace while retaining private source for seven days", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T00:00:00Z"));
    const { journal, initial, storage } = await fixture();
    await journal.fetch(request("/metadata", { topic: "Synthetic metadata" }));
    await journal.fetch(request("/sync", { ...initial, status: "ended", endedAt: Date.now() }));
    vi.advanceTimersByTime(READER_GRACE);
    expect((await journal.fetch(request("/read", undefined, { "x-reader-hash": readerHash }))).status).toBe(403);
    expect((await journal.fetch(request("/archive"))).status).toBe(200);
    vi.advanceTimersByTime(HISTORY_RETENTION - READER_GRACE);
    expect((await journal.fetch(request("/archive"))).status).toBe(410);
    expect(await journal.fetch(request("/metadata", { topic: "Late edit" })).then((response) => response.status)).toBe(410);
    expect(await storage.get("metadata")).toBeUndefined();
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
    expect(await (await journal.fetch(request("/archive"))).json()).toMatchObject({ summary: { id: options.requestId, status: "queued", promptVersion: "source-grounded-v2" } });
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
    return { room, storage, controllerHash, serviceId: details!.serviceId, journals };
  }
  it("archives a manual caption as an operator note while paused", async () => {
    const { room, controllerHash, serviceId, journals } = await fixture();
    await room.fetch(request("/internal/control", { action: "pause", controllerHash }));
    const response = await room.fetch(request("/internal/control", {
      action: "manual", controllerHash, targetLanguage: "en", manualText: "We will resume after the offering.",
    }));
    expect(response.status).toBe(200);
    expect(await response.clone().json()).not.toMatchObject({ historyIncomplete: true });
    const read = await (await journals.get(serviceId)!.fetch(
      request("/read", undefined, { "x-reader-hash": readerHash }),
    )).json();
    expect(read).toMatchObject({ notes: [{ text: "We will resume after the offering." }] });
  });
  it("does not archive a show-test caption even while paused", async () => {
    const { room, controllerHash, serviceId, journals } = await fixture();
    await room.fetch(request("/internal/control", { action: "pause", controllerHash }));
    const response = await room.fetch(request("/internal/control", {
      action: "show-test", controllerHash, targetLanguage: "en", style: {},
    }));
    expect(response.status).toBe(200);
    const read = await (await journals.get(serviceId)!.fetch(
      request("/read", undefined, { "x-reader-hash": readerHash }),
    )).json() as { notes: unknown[] };
    expect(read.notes).toEqual([]);
  });
  it("surfaces historyIncomplete when the journal rejects a manual caption's note", async () => {
    const { room, controllerHash, serviceId, journals } = await fixture();
    const journal = journals.get(serviceId)!;
    for (let id = 1; id <= MAX_JOURNAL_NOTES; id++) {
      await journal.fetch(request("/note", note(id, `Note ${id}`)));
    }
    await room.fetch(request("/internal/control", { action: "pause", controllerHash }));
    for (let i = 0; i < MAX_JOURNAL_NOTES; i++) {
      await room.fetch(request("/internal/control", { action: "show-test", controllerHash, targetLanguage: "en", style: {} }));
    }
    const response = await room.fetch(request("/internal/control", {
      action: "manual", controllerHash, targetLanguage: "en", manualText: "One too many.",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ historyIncomplete: true });
  });
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
    await room.fetch(request("/internal/experience/pair", { controllerHash, identityKey, remoteHash }));
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
  it("reports an unacknowledged command as unconfirmed after 45 seconds and unlocks the remote", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T00:00:00Z"));
    try {
      const { room, controllerHash, serviceId } = await fixture(); const remoteHash = "e".repeat(64);
      await room.fetch(request("/internal/experience/pair", { controllerHash, identityKey, remoteHash }));
      expect((await room.fetch(request("/internal/experience/remote", { serviceId, remoteHash, id: "remote-command-0002", action: "pause" }))).status).toBe(200);
      expect((await room.fetch(request("/internal/experience/remote", { serviceId, remoteHash, id: "remote-command-0003", action: "clear" }))).status).toBe(409);
      vi.setSystemTime(new Date("2026-09-13T00:00:44Z"));
      expect(await (await room.fetch(request("/internal/experience/remote", { serviceId, remoteHash }))).json()).toMatchObject({ command: { status: "pending" } });
      vi.setSystemTime(new Date("2026-09-13T00:00:46Z"));
      expect(await (await room.fetch(request("/internal/experience/remote", { serviceId, remoteHash }))).json()).toMatchObject({ command: { id: "remote-command-0002", status: "failed" }, status: "paused" });
      expect((await room.fetch(request("/internal/experience/remote", { serviceId, remoteHash, id: "remote-command-0003", action: "clear" }))).status).toBe(200);
    } finally { vi.useRealTimers(); }
  });
  it("keeps one remote per operator identity so a second phone controls the same service", async () => {
    const { room, controllerHash, serviceId } = await fixture();
    const first = "e".repeat(64);
    const second = "f".repeat(64);
    await room.fetch(request("/internal/experience/pair", { controllerHash, identityKey, remoteHash: first }));
    await room.fetch(request("/internal/experience/pair", {
      identityKey: `operator:${"c".repeat(64)}`, remoteHash: second,
    }));

    expect((await room.fetch(request("/internal/experience/remote", { serviceId, remoteHash: first }))).status).toBe(200);
    expect((await room.fetch(request("/internal/experience/remote", { serviceId, remoteHash: second, id: "remote-command-0010", action: "pause" }))).status).toBe(200);
    expect((await room.fetch(request("/internal/experience/remote", { serviceId, remoteHash: "9".repeat(64) }))).status).toBe(403);
  });

  it("replaces only the re-pairing operator's own remote", async () => {
    const { room, controllerHash, serviceId } = await fixture();
    const other = `operator:${"c".repeat(64)}`;
    await room.fetch(request("/internal/experience/pair", { controllerHash, identityKey, remoteHash: "e".repeat(64) }));
    await room.fetch(request("/internal/experience/pair", { identityKey: other, remoteHash: "f".repeat(64) }));
    await room.fetch(request("/internal/experience/pair", { identityKey: other, remoteHash: "d".repeat(64) }));

    expect((await room.fetch(request("/internal/experience/remote", { serviceId, remoteHash: "e".repeat(64) }))).status).toBe(200);
    expect((await room.fetch(request("/internal/experience/remote", { serviceId, remoteHash: "d".repeat(64) }))).status).toBe(200);
    expect((await room.fetch(request("/internal/experience/remote", { serviceId, remoteHash: "f".repeat(64) }))).status).toBe(403);
  });

  it("scopes remote command history to one service", async () => {
    const { room, controllerHash, serviceId } = await fixture();
    const remoteHash = "e".repeat(64);
    await room.fetch(request("/internal/experience/pair", { controllerHash, identityKey, remoteHash }));
    const command = { id: "remote-command-0020", action: "clear" };
    expect((await room.fetch(request("/internal/experience/remote", { serviceId, remoteHash, ...command }))).status).toBe(200);

    const restarted = await (await room.fetch(request("/internal/service", {
      controllerHash, viewerTokenHash: "d".repeat(64), readerHash, takeover: true,
    }))).json() as { serviceId: string };
    await room.fetch(request("/internal/experience/pair", { controllerHash, identityKey, remoteHash }));
    const replayed = await (await room.fetch(request("/internal/experience/remote", {
      serviceId: restarted.serviceId, remoteHash, ...command,
    }))).json() as { command: { status: string } };
    expect(replayed.command).toMatchObject({ id: command.id, status: "pending" });
  });

  it("refuses pairing without a hashed operator identity", async () => {
    const { room, controllerHash } = await fixture();
    const response = await room.fetch(request("/internal/experience/pair", { controllerHash, remoteHash: "e".repeat(64) }));
    expect(response.status).toBe(400);
  });

  it("rejects disconnected Resume and old pairing after takeover", async () => {
    const { room, controllerHash, serviceId } = await fixture(); const remoteHash = "e".repeat(64);
    await room.fetch(request("/internal/experience/pair", { controllerHash, identityKey, remoteHash }));
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
  it("generates a manual summary without putting record-only metadata in the prompt", async () => {
    const run = vi.fn(async () => ({ response: JSON.stringify({ points: [{ text: "Synthetic supported point", sourceIds: [1] }] }),
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }));
    const { journal, initial, storage } = await fixture(true, optionalEnvironment(run));
    await journal.fetch(request("/metadata", { topic: "Synthetic record-only detail" }));
    await journal.fetch(request("/source", { id: 1, text: "Synthetic source", language: "id", translationRevision: 1 }));
    await journal.fetch(request("/sync", { ...initial, endedAt: Date.now(), status: "ended" }));
    await journal.fetch(request("/summary", summaryOptions));
    await journal.alarm(); await journal.alarm();
    expect(run).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(run.mock.calls)).not.toContain("Synthetic record-only detail");
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

describe("automatic summary", () => {
  const summaryRun = () => vi.fn(async () => ({ response: JSON.stringify({ points: [{ text: "Synthetic supported point", sourceIds: [1] }] }),
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }));
  const autoRequest = { options: { model: SUMMARY_MODELS[1], language: "id", length: "short", guidance: "" } };
  async function savedWithSource(env: ExperienceEnvironment) {
    const created = await fixture(true, env);
    await created.journal.fetch(request("/source", { id: 1, text: "Synthetic source", language: "id", translationRevision: 1 }));
    return created;
  }

  it("waits for the journal's End before generating the summary", async () => {
    const run = summaryRun();
    const { journal, initial, storage } = await savedWithSource(optionalEnvironment(run));
    expect((await journal.fetch(request("/auto-summary", autoRequest))).status).toBe(202);
    await journal.alarm();
    expect(run).not.toHaveBeenCalled();
    expect(await storage.get("summary")).toBeUndefined();

    await journal.fetch(request("/sync", { ...initial, endedAt: Date.now(), status: "ended" }));
    await journal.alarm(); await journal.alarm(); await journal.alarm();
    expect(run).toHaveBeenCalledTimes(2);
    expect(await storage.get("summary")).toMatchObject({ status: "completed", automatic: true, result: [{ sourceIds: [1] }] });
    expect(await storage.get("auto-summary")).toBeUndefined();
  });

  it("keeps a summary the operator already started instead of generating a second", async () => {
    const run = summaryRun();
    const { journal, initial, storage } = await savedWithSource(optionalEnvironment(run));
    await journal.fetch(request("/sync", { ...initial, endedAt: Date.now(), status: "ended" }));
    await journal.fetch(request("/summary", summaryOptions));
    await journal.fetch(request("/auto-summary", autoRequest));
    await journal.alarm(); await journal.alarm(); await journal.alarm();
    expect(run).toHaveBeenCalledTimes(2);
    const job = await storage.get<{ id: string; automatic?: boolean }>("summary");
    expect(job?.id).toBe(summaryOptions.requestId);
    expect(job?.automatic).toBeUndefined();
  });

  it("ignores unsaved services and rejects malformed requests", async () => {
    const unsaved = await fixture(false);
    expect(await (await unsaved.journal.fetch(request("/auto-summary", autoRequest))).json()).toEqual({ saved: false });
    const saved = await fixture(true);
    expect((await saved.journal.fetch(request("/auto-summary", { options: { ...autoRequest.options, model: "unknown" } }))).status).toBe(400);
    expect((await saved.journal.fetch(request("/auto-summary", {}))).status).toBe(400);
  });

  it("queues only for operators who opted in, using their saved summary defaults", async () => {
    const journalFetch = vi.fn(async () => Response.json({ queued: true }, { status: 202 }));
    const env = (autoSummary: boolean, enabled = "true"): ExperienceEnvironment => ({
      CAPTION_OPTIONAL_AI_ENABLED: enabled,
      OPERATOR_PREFERENCES: { idFromName: (name: string) => name, get: () => ({ fetch: async () =>
        Response.json({ autoSummary, summaryDefaults: { model: SUMMARY_MODELS[0], language: "en", length: "detailed", guidance: "" } }) }) },
      SERMON_JOURNALS: { idFromName: (name: string) => name, get: () => ({ fetch: journalFetch }) },
    });
    await queueAutoSummary(env(false), id, "operator@example.org");
    await queueAutoSummary(env(true, "false"), id, "operator@example.org");
    expect(journalFetch).not.toHaveBeenCalled();
    await queueAutoSummary(env(true), id, "operator@example.org");
    const sent = journalFetch.mock.calls[0] as unknown as [Request];
    expect(new URL(sent[0].url).pathname).toBe("/auto-summary");
    expect(await sent[0].json()).toEqual({ options: { model: SUMMARY_MODELS[0], language: "en", length: "detailed", guidance: "" } });
  });
});
