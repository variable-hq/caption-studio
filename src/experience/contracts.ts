import type { LlmTokenUsage } from "@/ai/contracts";

export const DAY = 86_400_000;
export const HISTORY_RETENTION = 7 * DAY;
export const USAGE_RETENTION = 30 * DAY;
export const READER_GRACE = 30 * 60_000;
export const READER_INTERVAL = 30_000;
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
  SERMON_JOURNALS?: Namespace;
  AI_USAGE?: Namespace;
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  // Explicit deployment switch: only enable after verifying account Free plan and logging.
  CAPTION_OPTIONAL_AI_ENABLED?: string;
}
export interface UsageRecord {
  id: string;
  serviceId: string;
  stage: UsageStage;
  provider: "groq" | "cloudflare";
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
  cursor: number;
  notes: SummaryPoint[];
  result?: SummaryPoint[];
  error?: string;
  promptVersion: "tb2-grounded-v1";
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
