import { mergeModerationRules, parseGlossaryInput, parseModerationInput } from "@/live/config";
import { prepareCaptionForms } from "@/pipeline/caption-pipeline";
import { isLanguageLocale } from "@/domain/languages";
import { HASH_HEX_PATTERN, UUID_PATTERN } from "@/http/tokens";
import {
  DAY, HISTORY_RETENTION, MAX_JOURNAL_NOTES, READER_GRACE, READER_INTERVAL, SUMMARY_MODELS, json,
  type AutoSummaryRequest, type ExperienceEnvironment, type JournalState, type ReaderInput, type ReaderNote, type ReaderParagraph,
  type SourceRecord, type SummaryJob, type SummaryOptions, type SummaryPoint,
  type SessionMetadata, normalizeSessionMetadata,
} from "./contracts";
import { optionalInference } from "./provider";
import { buildReaderPrompt, buildSummaryPrompt } from "./prompt";
import { outputLooksUnsafe } from "@/ai/output-guard";

const key = (prefix: string, id: number) => `${prefix}:${String(id).padStart(6, "0")}`;
const byteLength = (text: string) => new TextEncoder().encode(text).length;
const validSummaryOptions = (body: Partial<SummaryOptions>) =>
  SUMMARY_MODELS.includes(body.model!) && isLanguageLocale(body.language ?? "") &&
  typeof body.guidance === "string" && body.guidance.length <= 2000 && ["short", "detailed"].includes(body.length ?? "");

export function parseSummary(text: string, allowedIds: Set<number>): SummaryPoint[] {
  const value = JSON.parse(text) as { points?: SummaryPoint[] };
  if (!Array.isArray(value.points) || !value.points.length || value.points.length > 24) throw new Error("Invalid summary structure.");
  return value.points.map((point) => {
    if (typeof point.text !== "string" || !point.text.trim() || point.text.length > 1200 ||
      !Array.isArray(point.sourceIds) || !point.sourceIds.length || point.sourceIds.length > 100 ||
      point.sourceIds.some((id) => !Number.isSafeInteger(id) || !allowedIds.has(id))) {
      throw new Error("Summary contains unsupported source references.");
    }
    return { text: point.text.trim(), sourceIds: [...new Set(point.sourceIds)] };
  });
}

/** One session per object. Unsaved source and reader buffers never enter durable storage. */
/** Task text for the summary prompt; the prompt builder adds the envelope and the untrusted-data rules. */
export const SUMMARY_SYNTHESIS_TASK = "Combine these grounded notes into a transcript summary. Include theme, outline, main points, mentioned references, speaker applications and uncertainty when supported.";
export const SUMMARY_SECTION_TASK = "Summarize this transcript section, preserving evidence IDs.";

export class SermonJournal {
  private pending: ReaderInput[] = [];
  private latest: ReaderParagraph | null = null;
  private latestNote: ReaderNote | null = null;
  private running = false;
  constructor(private readonly state: DurableObjectState, private readonly env: ExperienceEnvironment) {}

  private async configuration() {
    if (await this.state.storage.get("deleted")) return null;
    const current = await this.state.storage.get<JournalState>("state");
    if (!current || current.deleted) return null;
    const now = Date.now();
    if (!current.endedAt && current.expiresAt <= now) {
      current.endedAt = current.expiresAt;
      current.status = "ended";
      await this.state.storage.put("state", current);
    }
    if (current.endedAt && current.endedAt + (current.saved ? HISTORY_RETENTION : READER_GRACE) <= now) {
      await this.erase();
      return null;
    }
    return current;
  }

  private async erase() {
    this.pending = [];
    this.latest = null;
    this.latestNote = null;
    await this.state.storage.deleteAll();
    // Tombstone prevents a delayed lifecycle message from recreating content.
    await this.state.storage.put("deleted", true);
    await this.state.storage.deleteAlarm();
  }

  async fetch(request: Request) {
    return this.state.blockConcurrencyWhile(() => this.dispatch(request));
  }

  private async dispatch(request: Request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/sync" && request.method === "POST") return this.handleSync(request);
    const current = await this.configuration();
    if (!current) return json({ error: "Sermon unavailable or expired." }, 410);
    if (path === "/delete" && request.method === "POST") return this.handleDelete(current);
    if (path === "/metadata" && request.method === "GET") return this.handleMetadataRead(current);
    if (path === "/metadata" && request.method === "POST") return this.handleMetadata(request, current);
    if (path === "/source" && request.method === "POST") return this.handleSource(request, current);
    if (path === "/gap" && request.method === "POST") return this.handleGap(current);
    if (path === "/append" && request.method === "POST") return this.handleAppend(request, current);
    if (path === "/note" && request.method === "POST") return this.handleNote(request, current);
    if (path === "/read") return this.handleRead(request, url, current);
    if (path === "/archive") return this.handleArchive(url, current);
    if (path === "/remove" && request.method === "POST") return this.handleRemove(request, current);
    if (path === "/correct" && request.method === "POST") return this.handleCorrect(request, current);
    if (path === "/summary" && request.method === "POST") return this.handleSummary(request, current);
    if (path === "/auto-summary" && request.method === "POST") return this.handleAutoSummary(request, current);
    return json({ error: "Journal route not found." }, 404);
  }

  private async handleSync(request: Request) {
    const incoming = await request.json() as JournalState;
    if (await this.state.storage.get("deleted")) return json({ error: "Sermon deleted." }, 410);
    if (!UUID_PATTERN.test(incoming.id) || !HASH_HEX_PATTERN.test(incoming.readerHash) ||
        !Number.isSafeInteger(incoming.epoch) || incoming.epoch < 0 ||
        !Number.isFinite(incoming.startedAt) || !Number.isFinite(incoming.expiresAt)) return json({ error: "Invalid journal." }, 400);
    const old = await this.configuration();
    if (await this.state.storage.get("deleted")) return json({ error: "Sermon expired." }, 410);
    if (old && (old.id !== incoming.id || incoming.epoch < old.epoch || (old.endedAt && !incoming.endedAt))) return json({ ignored: true });
    const current: JournalState = old ? { ...old, status: incoming.status, epoch: incoming.epoch,
      readerHash: incoming.readerHash, endedAt: old.endedAt ?? incoming.endedAt,
      revoked: old.revoked || incoming.revoked } : { ...incoming, revision: 0,
      readerCalls: 0, summaryCalls: 0, incomplete: false };
    if (old && old.epoch !== current.epoch) {
      this.pending = [];
      await this.state.storage.delete(["pending", "reader-flight"]);
    }
    await this.state.storage.put("state", current);
    await this.schedule(current, current.endedAt ? 1000 : READER_INTERVAL);
    return json({ synchronized: true });
  }

  private async handleDelete(current: JournalState) {
    if (!current.endedAt) return json({ error: "End the session before deleting its archive." }, 409);
    await this.erase();
    return json({ deleted: true });
  }

  private async handleMetadata(request: Request, current: JournalState) {
    if (!current.saved) return json({ error: "Session details require saved history." }, 409);
    const metadata = normalizeSessionMetadata(await request.json());
    await this.state.storage.put("metadata", metadata);
    return json({ metadata });
  }

  private async handleMetadataRead(current: JournalState) {
    return json({ metadata: current.saved
      ? await this.state.storage.get<SessionMetadata>("metadata") ?? normalizeSessionMetadata(null)
      : normalizeSessionMetadata(null) });
  }

  private async handleSource(request: Request, current: JournalState) {
    const body = await request.json() as SourceRecord;
    if (!Number.isSafeInteger(body.id) || body.id < 1 || body.id > 900 ||
        typeof body.text !== "string" || body.text.length > 4000 ||
        !isLanguageLocale(body.language) || !Number.isSafeInteger(body.translationRevision)) return json({ error: "Invalid source segment." }, 400);
    if (current.endedAt) return json({ error: "Source history is finalized." }, 409);
    if (!current.saved) return json({ saved: false });
    const sourceKey = key("source", body.id);
    if (!await this.state.storage.get(sourceKey)) await this.state.storage.put(sourceKey, {
      id: body.id, at: Date.now(), text: body.text, language: body.language,
      epoch: current.epoch, translationRevision: body.translationRevision,
      ...(typeof body.correction === "string" && body.correction.length <= 4000 ? { correction: body.correction } : {}),
    } satisfies SourceRecord);
    return json({ saved: true });
  }

  private async handleGap(current: JournalState) {
    current.incomplete = true;
    await this.state.storage.put("state", current);
    return json({ recorded: true });
  }

  private async handleAppend(request: Request, current: JournalState) {
    const input = await request.json() as ReaderInput;
    if (!Number.isSafeInteger(input.id) || input.id < 1 || input.id > 900 ||
        typeof input.publicText !== "string" || input.publicText.length > 2000 ||
        !isLanguageLocale(input.targetLanguage) || typeof input.filterText !== "string" || input.filterText.length > 4000 ||
        typeof input.keywordText !== "string" || input.keywordText.length > 8000) return json({ error: "Invalid reader segment." }, 400);
    if (current.endedAt || current.status !== "live" || input.epoch !== current.epoch) return json({ ignored: true });
    const high = await this.state.storage.get<number>("accepted") ?? 0;
    if (input.id <= high) return json({ duplicate: true });
    await this.state.storage.put("accepted", input.id);
    if (current.saved) this.pending = await this.state.storage.get<ReaderInput[]>("pending") ?? [];
    // No processing across language/settings boundaries. A full buffer falls back unchanged.
    if (this.pending.length && (this.pending[0].translationRevision !== input.translationRevision ||
        this.pending[0].targetLanguage !== input.targetLanguage || this.pending.length >= 5)) {
      await this.commitFallback(current, this.pending);
      this.pending = [];
    }
    if (input.publicText.trim()) this.pending.push(input);
    if (current.saved) await this.state.storage.put("pending", this.pending);
    return json({ accepted: true });
  }

  private async handleNote(request: Request, current: JournalState) {
    const input = await request.json() as { id: number; text: string; targetLanguage: string };
    if (!Number.isSafeInteger(input.id) || input.id < 1 ||
        typeof input.text !== "string" || !input.text.trim() || input.text.length > 2000 ||
        !isLanguageLocale(input.targetLanguage)) return json({ error: "Invalid operator note." }, 400);
    if (current.endedAt) return json({ ignored: true });
    const high = await this.state.storage.get<number>("acceptedNote") ?? 0;
    if (input.id <= high) return json({ duplicate: true });
    if (current.saved && (await this.state.storage.list({ prefix: "note:", limit: MAX_JOURNAL_NOTES })).size >= MAX_JOURNAL_NOTES) {
      return json({ error: "Operator note limit reached for this session." }, 409);
    }
    // Flush any already-spoken, not-yet-committed text first so its paragraph gets an
    // earlier timestamp than this note, keeping the reader's timestamp-sorted order correct.
    if (current.saved) this.pending = await this.state.storage.get<ReaderInput[]>("pending") ?? [];
    if (this.pending.length) {
      await this.commitFallback(current, this.pending);
      this.pending = [];
      if (current.saved) await this.state.storage.put("pending", this.pending);
    }
    await this.state.storage.put("acceptedNote", input.id);
    const note: ReaderNote = { id: input.id, text: input.text.trim(), language: input.targetLanguage, at: Date.now() };
    this.latestNote = note;
    if (current.saved) await this.state.storage.put(key("note", note.id), note);
    return json({ accepted: true });
  }

  private async handleRead(request: Request, url: URL, current: JournalState) {
    if (request.headers.get("x-reader-hash") !== current.readerHash || current.revoked ||
        (current.endedAt && Date.now() >= current.endedAt + READER_GRACE)) return json({ error: "Reader link expired or replaced." }, 403);
    const after = Math.max(0, Number(url.searchParams.get("after")) || 0);
    const entries = current.saved ? [...(await this.state.storage.list<ReaderParagraph>({ prefix: "paragraph:",
      startAfter: key("paragraph", after), limit: 50 })).values()] : this.latest && this.latest.id > after ? [this.latest] : [];
    const removed = await this.state.storage.get<number[]>("removed") ?? [];
    return json({ status: current.status, saved: current.saved, paragraphs: entries,
      removed, notes: await this.notes(current), revision: current.revision, more: entries.length === 50,
      delaySeconds: READER_INTERVAL / 1000 });
  }

  private async handleArchive(url: URL, current: JournalState) {
    const after = Math.max(0, Number(url.searchParams.get("after")) || 0);
    const paragraphAfter = Math.max(0, Number(url.searchParams.get("paragraphAfter")) || 0);
    const sources = current.saved ? [...(await this.state.storage.list<SourceRecord>({ prefix: "source:", startAfter: key("source", after), limit: 50 })).values()] : [];
    const paragraphs = current.saved ? [...(await this.state.storage.list<ReaderParagraph>({ prefix: "paragraph:", startAfter: key("paragraph", paragraphAfter), limit: 50 })).values()] : this.latest ? [this.latest] : [];
    const details = { ...current, readerHash: undefined };
    return json({ details, metadata: current.saved ? await this.state.storage.get<SessionMetadata>("metadata") ?? normalizeSessionMetadata(null) : normalizeSessionMetadata(null), sources, paragraphs, notes: await this.notes(current), summary: await this.state.storage.get("summary") ?? null,
      more: sources.length === 50, moreParagraphs: paragraphs.length === 50 });
  }

  private async handleRemove(request: Request, current: JournalState) {
    const { id } = await request.json() as { id: number };
    const paragraph = current.saved ? await this.state.storage.get<ReaderParagraph>(key("paragraph", id)) : this.latest?.id === id ? this.latest : null;
    if (!paragraph) return json({ error: "Passage not found." }, 404);
    paragraph.removed = true;
    paragraph.text = "";
    if (current.saved) {
      await this.state.storage.put(key("paragraph", id), paragraph);
      for (const sourceId of paragraph.sourceIds) {
        const source = await this.state.storage.get<SourceRecord>(key("source", sourceId));
        if (source) await this.state.storage.put(key("source", sourceId), { ...source, excluded: true });
      }
    }
    const removed = await this.state.storage.get<number[]>("removed") ?? [];
    await this.state.storage.put("removed", [...new Set([...removed, id])].slice(-900));
    await this.invalidate(current);
    return json({ removed: true, sourceIds: paragraph.sourceIds });
  }

  private async handleCorrect(request: Request, current: JournalState) {
    const body = await request.json() as { id: number; text: string };
    if (!current.saved || typeof body.text !== "string" || !body.text.trim() || body.text.length > 4000) return json({ error: "Invalid correction." }, 400);
    const source = await this.state.storage.get<SourceRecord>(key("source", body.id));
    if (!source) return json({ error: "Source not found." }, 404);
    await this.state.storage.put(key("source", body.id), { ...source, correction: body.text.trim() });
    await this.invalidate(current);
    return json({ corrected: true });
  }

  private async handleSummary(request: Request, current: JournalState) {
    if (!current.saved || !current.endedAt) return json({ error: "End a session with saved history before generating a summary." }, 409);
    const body = await request.json() as SummaryOptions & { requestId: string };
    if (!validSummaryOptions(body) || !/^[a-zA-Z0-9-]{16,64}$/u.test(body.requestId)) return json({ error: "Invalid summary settings." }, 400);
    const previous = await this.state.storage.get<SummaryJob>("summary");
    if (previous && (previous.id === body.requestId || ["queued", "running"].includes(previous.status))) return json(previous);
    const job: SummaryJob = { id: body.requestId, status: "queued", revision: current.revision,
      options: { model: body.model, language: body.language, guidance: body.guidance, length: body.length },
      cursor: 0, notes: [], promptVersion: "source-grounded-v2" };
    await this.state.storage.put("summary", job);
    await this.schedule(current, 1000);
    return json(job, 202);
  }

  /** Held until the room's End reaches this journal; the alarm then promotes it to a job. */
  private async handleAutoSummary(request: Request, current: JournalState) {
    if (!current.saved) return json({ saved: false });
    const body = await request.json() as Partial<AutoSummaryRequest>;
    if (!body.options || !validSummaryOptions(body.options)) return json({ error: "Invalid automatic summary request." }, 400);
    const { model, language, guidance, length } = body.options;
    await this.state.storage.put("auto-summary", { options: { model, language, guidance, length } } satisfies AutoSummaryRequest);
    await this.schedule(current, 1000);
    return json({ queued: true }, 202);
  }

  private async promoteAutoSummary(current: JournalState) {
    if (!current.endedAt || !current.saved) return;
    await this.state.blockConcurrencyWhile(async () => {
      const request = await this.state.storage.get<AutoSummaryRequest>("auto-summary");
      if (!request) return;
      await this.state.storage.delete("auto-summary");
      // A summary the operator already started or finished is kept instead of a second one.
      if (await this.state.storage.get<SummaryJob>("summary")) return;
      await this.state.storage.put("summary", { id: `auto-${crypto.randomUUID()}`, status: "queued",
        revision: current.revision, options: request.options, cursor: 0, notes: [],
        promptVersion: "source-grounded-v2", automatic: true } satisfies SummaryJob);
    });
  }

  private async notes(current: JournalState): Promise<ReaderNote[]> {
    return current.saved
      ? [...(await this.state.storage.list<ReaderNote>({ prefix: "note:", limit: MAX_JOURNAL_NOTES })).values()]
      : this.latestNote ? [this.latestNote] : [];
  }

  private async invalidate(current: JournalState) {
    current.revision++;
    this.pending = [];
    await this.state.storage.put("state", current);
    await this.state.storage.delete(["pending", "reader-flight", "summary", "summary-flight"]);
  }

  private async schedule(current: JournalState, delay: number) {
    const deletionAt = (current.endedAt ?? current.expiresAt) + (current.saved ? HISTORY_RETENTION : READER_GRACE);
    await this.state.storage.setAlarm(Math.min(Date.now() + delay, deletionAt));
  }

  private async commitFallback(current: JournalState, inputs: ReaderInput[]) {
    if (!inputs.length) return;
    await this.commit(current, inputs, inputs.map((input) => input.publicText).join(" "), true);
  }

  private async commit(snapshot: JournalState, inputs: ReaderInput[], text: string, fallback: boolean) {
    const current = await this.configuration();
    if (!current || current.epoch !== snapshot.epoch || current.revision !== snapshot.revision) return;
    const first = inputs[0];
    if (!first || !isLanguageLocale(first.targetLanguage)) return;
    const moderated = prepareCaptionForms({
      sourceText: "",
      translatedText: text,
      targetLanguage: first.targetLanguage,
      glossary: parseGlossaryInput(first.keywordText, first.targetLanguage),
      moderationRules: mergeModerationRules(inputs.map((input) => parseModerationInput(input.filterText))),
    }).publicText;
    const paragraph: ReaderParagraph = { id: inputs.at(-1)!.id, sourceIds: inputs.map((input) => input.id),
      text: moderated.slice(0, 10_000), language: first.targetLanguage, epoch: snapshot.epoch,
      translationRevision: first.translationRevision, at: Date.now(), fallback };
    await this.state.storage.transaction(async (storage) => {
      const latest = await storage.get<JournalState>("state");
      if (!latest || await storage.get("deleted") || latest.epoch !== snapshot.epoch || latest.revision !== snapshot.revision ||
          (latest.endedAt && latest.endedAt + HISTORY_RETENTION <= Date.now())) return;
      if (latest.saved) await storage.put(key("paragraph", paragraph.id), paragraph);
      this.latest = paragraph;
    });
  }

  async alarm() {
    if (this.running) return;
    this.running = true;
    try {
      const work = await this.state.blockConcurrencyWhile(async () => {
        const current = await this.configuration();
        if (!current) return null;
        await this.schedule(current, READER_INTERVAL);
        const interrupted = current.saved ? await this.state.storage.get<{ snapshot: JournalState; inputs: ReaderInput[] }>("reader-flight") : undefined;
        if (interrupted) {
          // A provider outcome lost during eviction is never dispatched again.
          await this.commitFallback(interrupted.snapshot, interrupted.inputs);
          await this.state.storage.delete("reader-flight");
        }
        const pending = current.saved ? await this.state.storage.get<ReaderInput[]>("pending") ?? [] : this.pending;
        this.pending = [];
        if (pending.length && current.saved) await this.state.storage.put("reader-flight", { snapshot: current, inputs: pending });
        await this.state.storage.delete("pending");
        const allowReader = current.readerCalls < 200;
        if (pending.length && allowReader) {
          current.readerCalls++;
          await this.state.storage.put("state", current);
        }
        return { current, pending, allowReader };
      });
      if (!work) return;
      let current: JournalState | null = work.current;
      const { pending } = work;
      if (pending.length) {
        let text = pending.map((input) => input.publicText).join(" ");
        let fallback = true;
        if (work.allowReader) {
          try {
            const result = await optionalInference(this.env, current.id, "reader", SUMMARY_MODELS[1],
              buildReaderPrompt(pending.map((input) => input.publicText), pending[0].targetLanguage));
            if (result.length <= 2000 && !outputLooksUnsafe(result)) { text = result; fallback = false; }
          } catch { /* Publish existing moderated translations when optional inference fails. */ }
        }
        const snapshot = current;
        await this.state.blockConcurrencyWhile(async () => {
          await this.commit(snapshot, pending, text, fallback);
          await this.state.storage.delete("reader-flight");
        });
      }
      current = await this.configuration();
      if (!current) return;
      await this.promoteAutoSummary(current);
      const job = await this.state.storage.get<SummaryJob>("summary");
      const interrupted = await this.state.storage.get<{ id: string }>("summary-flight");
      if (job && interrupted?.id === job.id) {
        job.status = "failed";
        job.error = "Summary was interrupted; usage may be unknown. Generate again to retry.";
        await this.state.storage.put("summary", job);
        await this.state.storage.delete("summary-flight");
      } else if (job && ["queued", "running"].includes(job.status)) await this.runSummary(current, job);
      current = await this.configuration();
      if (!current) return;
      const nextJob = await this.state.storage.get<SummaryJob>("summary");
      await this.schedule(current, nextJob && ["queued", "running"].includes(nextJob.status) ? 1000 : current.endedAt ? DAY : READER_INTERVAL);
    } finally { this.running = false; }
  }

  private async storeSummary(job: SummaryJob) {
    return this.state.blockConcurrencyWhile(async () => {
      const latest = await this.configuration();
      const active = await this.state.storage.get<SummaryJob>("summary");
      if (!latest || latest.revision !== job.revision || active?.id !== job.id) return;
      await this.state.storage.put("summary", job);
      await this.state.storage.delete("summary-flight");
    });
  }

  private async runSummary(snapshot: JournalState, job: SummaryJob) {
    try {
      const work = await this.state.blockConcurrencyWhile(async () => {
        const current = await this.configuration();
        const active = await this.state.storage.get<SummaryJob>("summary");
        if (!current || active?.id !== job.id || current.revision !== snapshot.revision) return null;
        if (job.revision !== current.revision || !current.endedAt || !current.saved) throw new Error("Summary source changed. Generate again.");
        if (current.summaryCalls >= 60) throw new Error("This session's summary call budget was reached.");
        const records = [...(await this.state.storage.list<SourceRecord>({ prefix: "source:", startAfter: key("source", job.cursor), limit: 50 })).values()];
        const selected: SourceRecord[] = [];
        let bytes = 0;
        for (const record of records) {
          if (record.excluded) { job.cursor = record.id; continue; }
          const size = byteLength(record.correction ?? record.text) + 150;
          if (selected.length && bytes + size > 10_000) break;
          selected.push(record); bytes += size; job.cursor = record.id;
        }
        const synthesis = records.length === 0;
        if (synthesis && !job.notes.length) throw new Error("No included source transcript is available.");
        job.status = "running";
        if (!synthesis && !selected.length) {
          await this.state.storage.put("summary", job);
          return null;
        }
        current.summaryCalls++;
        await this.state.storage.put("state", current);
        // An interrupted call is recorded as unknown and requires a new manual request.
        await this.state.storage.put("summary-flight", { id: job.id, at: Date.now() });
        const data = synthesis ? {
          task: SUMMARY_SYNTHESIS_TASK,
          language: job.options.language, length: job.options.length, incomplete: current.incomplete, notes: job.notes,
        } : {
          task: SUMMARY_SECTION_TASK,
          language: job.options.language, length: job.options.length,
          incomplete: current.incomplete, segments: selected.map((record) => ({ id: record.id, at: record.at, text: record.correction ?? record.text })),
        };
        return { data, synthesis, allowed: new Set(synthesis ? job.notes.flatMap((point) => point.sourceIds) : selected.map((record) => record.id)) };
      });
      if (!work) return;
      const text = await optionalInference(this.env, snapshot.id, "summary", job.options.model,
        buildSummaryPrompt({ ...work.data, guidance: job.options.guidance }));
      if (outputLooksUnsafe(text)) throw new Error("Summary output failed a safety check. Generate again to retry.");
      const points = parseSummary(text, work.allowed);
      if (work.synthesis) { job.status = "completed"; job.result = points; }
      else {
        job.notes.push(...points);
        if (byteLength(JSON.stringify(job.notes)) > 14_000) throw new Error("Summary notes exceed the bounded synthesis context. Export and review the transcript.");
      }
      await this.storeSummary(job);
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Summary failed. Generate again before history expires.";
      await this.storeSummary(job);
    }
  }
}
