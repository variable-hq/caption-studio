import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LiveWorkerEnvironment } from "@/live/api";
import { handleExperienceRequest } from "./api";
import { SermonJournal } from "./sermon-journal";
import type { JournalState, Namespace } from "./contracts";

// One Access tenant is one workspace: these tests prove that a saved transcript
// belongs to the workspace, not to the operator whose session produced it.
vi.mock("jose", () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async (token: string) => {
    if (!token.endsWith("@example.test")) throw new Error("Unknown Access session.");
    return { payload: { email: token } };
  },
}));

class Storage {
  values = new Map<string, unknown>();
  alarmAt: number | null = null;
  async get<T>(key: string) { return structuredClone(this.values.get(key)) as T | undefined; }
  async put(key: string, value: unknown) { this.values.set(key, structuredClone(value)); }
  async delete(keys: string | string[]) { for (const key of [keys].flat()) this.values.delete(key); }
  async deleteAll() { this.values.clear(); }
  async list<T>({ prefix = "", startAfter = "", limit = Infinity } = {}) {
    return new Map([...this.values]
      .filter(([key]) => key.startsWith(prefix) && key > startAfter)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, limit)) as Map<string, T>;
  }
  async setAlarm(at: number) { this.alarmAt = at; }
  async getAlarm() { return this.alarmAt; }
  async deleteAlarm() { this.alarmAt = null; }
  async transaction<T>(work: (storage: Storage) => Promise<T>) { return work(this); }
}

function state(storage: Storage) {
  return {
    storage,
    getWebSockets: () => [],
    blockConcurrencyWhile: async <T>(work: () => Promise<T>) => work(),
  } as unknown as DurableObjectState;
}

const SERVICE_ID = "12345678-1234-1234-1234-123456789012";
const STARTING_OPERATOR = "first.operator@example.test";
const SECOND_OPERATOR = "second.operator@example.test";
const ARCHIVED = [{ id: SERVICE_ID, startedAt: 1_700_000_000_000 }];

function snapshot(overrides: Partial<JournalState> = {}): JournalState {
  return {
    id: SERVICE_ID, startedAt: Date.now(), expiresAt: Date.now() + 90 * 60_000,
    saved: true, readerHash: "a".repeat(64), status: "live", epoch: 0, revision: 0,
    incomplete: false, readerCalls: 0, summaryCalls: 0, ...overrides,
  };
}

let journal: SermonJournal;
let roomRequests: Request[];
let environment: LiveWorkerEnvironment;

/** Signs in as one Access identity; every operator of the tenant is equally authorized. */
function as(operator: string, path: string, body?: unknown) {
  return new Request(`https://caption.example.test${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "cf-access-jwt-assertion": operator },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(async () => {
  journal = new SermonJournal(state(new Storage()), {});
  const journals: Namespace = { idFromName: (name) => name, get: () => journal };
  roomRequests = [];
  const rooms: Namespace = {
    idFromName: (name) => name,
    get: () => ({
      fetch: async (request: Request) => {
        roomRequests.push(request);
        return Response.json({ services: ARCHIVED });
      },
    }),
  };
  environment = {
    SERMON_JOURNALS: journals, CAPTION_ROOMS: rooms,
    CLOUDFLARE_ACCESS_AUD: "caption-studio-audience",
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: "https://caption-studio.cloudflareaccess.com",
  } as unknown as LiveWorkerEnvironment;

  await journal.fetch(new Request("https://internal/sync", { method: "POST", body: JSON.stringify(snapshot()) }));
  await journal.fetch(new Request("https://internal/source", { method: "POST", body: JSON.stringify({
    id: 1, at: Date.now(), text: "Synthetic recognized transcript source.", language: "id", epoch: 0, translationRevision: 1,
  }) }));
});

describe("workspace-wide transcript archives", () => {
  it("serves the archive under the transcripts path and the older sermons alias", async () => {
    const current = await handleExperienceRequest(as(STARTING_OPERATOR, `/api/live/experience/transcripts/${SERVICE_ID}/archive`), environment);
    const alias = await handleExperienceRequest(as(STARTING_OPERATOR, `/api/live/experience/sermons/${SERVICE_ID}/archive`), environment);

    expect(current?.status).toBe(200);
    expect(alias?.status).toBe(200);
    expect(await alias?.json()).toEqual(await current?.json());
  });

  it("serves the same archive to an operator who did not run the service", async () => {
    const path = `/api/live/experience/sermons/${SERVICE_ID}/archive`;
    const starting = await handleExperienceRequest(as(STARTING_OPERATOR, path), environment);
    const second = await handleExperienceRequest(as(SECOND_OPERATOR, path), environment);

    expect(starting?.status).toBe(200);
    expect(second?.status).toBe(200);
    const [first, other] = await Promise.all([starting!.json(), second!.json()]);
    expect(other).toEqual(first);
    expect((other as { sources: { text: string }[] }).sources[0]?.text)
      .toBe("Synthetic recognized transcript source.");
  });

  it("lets a second operator correct a passage the first operator recorded", async () => {
    const response = await handleExperienceRequest(
      as(SECOND_OPERATOR, `/api/live/experience/sermons/${SERVICE_ID}/correct`, { id: 1, text: "Corrected transcript source." }),
      environment,
    );
    expect(response?.status).toBe(200);

    const archive = await handleExperienceRequest(as(STARTING_OPERATOR, `/api/live/experience/sermons/${SERVICE_ID}/archive`), environment);
    const body = await archive!.json() as { sources: { correction?: string }[] };
    expect(body.sources[0]?.correction).toBe("Corrected transcript source.");
  });

  it("lets a second operator delete the archive once the service has ended", async () => {
    await journal.fetch(new Request("https://internal/sync", { method: "POST",
      body: JSON.stringify(snapshot({ status: "ended", endedAt: Date.now() })) }));

    const response = await handleExperienceRequest(
      as(SECOND_OPERATOR, `/api/live/experience/sermons/${SERVICE_ID}/delete`, { confirm: true }),
      environment,
    );
    expect(response?.status).toBe(200);
    expect(roomRequests.at(-1)?.url).toContain("/internal/history/delete");
  });

  it("lists saved transcripts for an operator with no session of their own", async () => {
    const metadataRead = vi.spyOn(journal, "fetch");
    const response = await handleExperienceRequest(as(SECOND_OPERATOR, "/api/live/experience/history"), environment);
    expect(response?.status).toBe(200);
    expect(await response!.json()).toEqual({ services: [{ ...ARCHIVED[0], metadata: { topic: "", speaker: "", description: "", sessionAt: null } }] });
    // The identity authorizes the read; it never scopes it, so nothing is forwarded.
    expect(roomRequests[0]?.headers.get("cf-access-jwt-assertion")).toBeNull();
    expect(await roomRequests[0]?.clone().text()).toBe("");
    expect(metadataRead).toHaveBeenCalledWith(expect.objectContaining({ url: "https://internal/metadata" }));
    expect(metadataRead).not.toHaveBeenCalledWith(expect.objectContaining({ url: "https://internal/archive" }));
  });

  it("enforces the 32 KB cap on metadata writes", async () => {
    const body = { topic: "x".repeat(33_000) };
    const response = await handleExperienceRequest(as(SECOND_OPERATOR, `/api/live/experience/sermons/${SERVICE_ID}/metadata`, body), environment);
    expect(response?.status).toBe(413);
  });

  it("still refuses an archive request that carries no Access session", async () => {
    const response = await handleExperienceRequest(
      new Request(`https://caption.example.test/api/live/experience/sermons/${SERVICE_ID}/archive`),
      environment,
    );
    expect(response?.status).toBe(401);
  });
});
