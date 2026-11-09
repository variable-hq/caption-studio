import type { AiProviderId } from "@/ai/providers";
import type { PresetSnapshot } from "@/experience/presets";
import type { LlmTokenUsage } from "@/ai/contracts";

export const DAY = 86_400_000;
export const HISTORY_RETENTION = 7 * DAY;
export const USAGE_RETENTION = 30 * DAY;
export const READER_GRACE = 30 * 60_000;
export const READER_INTERVAL = 30_000;
export const MAX_JOURNAL_NOTES = 50;
export const MAX_SESSION_TOPIC_CHARS = 120;
export const MAX_SESSION_SPEAKER_CHARS = 120;
export const MAX_SESSION_DESCRIPTION_CHARS = 1_000;
const SESSION_METADATA_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

export interface SessionMetadata { topic: string; speaker: string; description: string; sessionAt: number | null }
export const EMPTY_SESSION_METADATA: SessionMetadata = { topic: "", speaker: "", description: "", sessionAt: null };
export function normalizeSessionMetadata(input: unknown): SessionMetadata {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ...EMPTY_SESSION_METADATA };
  const value = input as Record<string, unknown>;
  const clean = (raw: unknown, max: number) => typeof raw === "string" && !SESSION_METADATA_CONTROL_CHARACTERS.test(raw) ? raw.trim().slice(0, max).trim() : "";
  const sessionAt = value.sessionAt === null || value.sessionAt === "" ? null : typeof value.sessionAt === "number" && Number.isInteger(value.sessionAt) && Number.isFinite(value.sessionAt) && value.sessionAt >= 0 ? value.sessionAt : null;
  return { topic: clean(value.topic, MAX_SESSION_TOPIC_CHARS), speaker: clean(value.speaker, MAX_SESSION_SPEAKER_CHARS), description: clean(value.description, MAX_SESSION_DESCRIPTION_CHARS), sessionAt };
}
export const SUMMARY_MODELS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3.1-8b-instruct-fp8",
] as const;
export type SummaryModel = (typeof SUMMARY_MODELS)[number];
export type UsageStage = "transcription" | "translation" | "reader" | "summary";
export interface Namespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
export interface ExperienceEnvironment {
  TRANSCRIPT_JOURNALS?: Namespace;
  AI_USAGE?: Namespace;
  OPERATOR_PREFERENCES?: Namespace;
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  // Explicit deployment switch: only enable after verifying account Free plan and logging.
  CAPTION_OPTIONAL_AI_ENABLED?: string;
  // Workspace plan for preset limits (`src/experience/entitlements.ts`); unset means the default limits.
  WORKSPACE_PLAN?: string;
}
export interface UsageRecord {
  id: string;
  sessionId: string;
  /** Name written before sessionId; mapped on read and dropped on the next write. */
  serviceId?: string;
  stage: UsageStage;
  provider: AiProviderId | "cloudflare";
  model: string;
  at: number;
  status: "pending" | "completed" | "unknown";
  tokens: LlmTokenUsage | null;
  audioSeconds: number | null;
  estimatedNeurons: number;
  reservedNeurons: number;
}
export interface JournalState {
  id: string;
  startedAt: number;
  expiresAt: number;
  endedAt?: number;
  saved: boolean;
  status: "live" | "paused" | "ended";
  readerHash: string;
  /** The session's format, copied when the journal is created and never replaced; absent reads as General. */
  preset?: PresetSnapshot;
  epoch: number;
  revision: number;
  incomplete: boolean;
  readerCalls: number;
  summaryCalls: number;
  deleted?: boolean;
  revoked?: boolean;
}
export interface SourceRecord {
  id: number;
  at: number;
  text: string;
  language: string;
  epoch: number;
  translationRevision: number;
  excluded?: boolean;
  correction?: string;
}
export interface ReaderInput {
  id: number;
  publicText: string;
  targetLanguage: string;
  epoch: number;
  translationRevision: number;
  filterText: string;
  keywordText: string;
}
export interface ReaderParagraph {
  id: number;
  sourceIds: number[];
  text: string;
  language: string;
  epoch: number;
  translationRevision: number;
  at: number;
  fallback: boolean;
  removed?: boolean;
}
/** An operator's manual caption, archived separately from the batched translation paragraphs. */
export interface ReaderNote {
  id: number;
  text: string;
  language: string;
  at: number;
}
export interface SummaryOptions {
  model: SummaryModel;
  language: string;
  guidance: string;
  length: "short" | "detailed";
}
export interface SummaryPoint { text: string; sourceIds: number[] }
export interface SummaryJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  revision: number;
  options: SummaryOptions;
  /** The built-in format the summary was generated under; absent on jobs made before formats. */
  presetId?: string;
  cursor: number;
  notes: SummaryPoint[];
  result?: SummaryPoint[];
  error?: string;
  promptVersion: "tb2-grounded-v1" | "source-grounded-v2";
  /** Queued by End for an operator who opted in, rather than by Generate summary. */
  automatic?: boolean;
}
/** Queued at End for the ending operator; promoted to a summary job once the journal has ended. */
export interface AutoSummaryRequest {
  options: SummaryOptions;
}
export function rpc(namespace: Namespace, id: string, path: string, body?: unknown) {
  return namespace.get(namespace.idFromName(id)).fetch(new Request(`https://internal${path}`, {
    method: body === undefined ? "GET" : "POST",
    signal: AbortSignal.timeout(8000),
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
}
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}
