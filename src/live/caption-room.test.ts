import { describe, expect, it, vi } from "vitest";

import { CloudProviderClient } from "@/ai/cloud-provider-client";
import { CaptionRoom, captionTokenHash } from "@/live/caption-room";
import {
  MAX_MANUAL_CAPTION_CHARS,
  MAX_SESSION_OBSERVERS,
  MAX_TRANSCRIPTION_REQUESTS,
  normalizeCaptionStyle,
} from "@/live/contracts";
import { handleLiveApiRequest, type LiveWorkerEnvironment } from "@/live/api";
import { handleInferenceRequest } from "@/live/inference-request";
import { LiveSessionClient } from "@/live/session-client";

const CONTROLLER_A = "a".repeat(64);
const CONTROLLER_B = "b".repeat(64);
const TOKEN_A = "1".repeat(64);
const TOKEN_B = "2".repeat(64);
const VIEWER_A = "3".repeat(64);
const VIEWER_B = "4".repeat(64);
const REFRESH_REQUEST_A = "refresh-request-0001";
const REFRESH_REQUEST_B = "refresh-request-0002";

class FakeStorage {
  readonly values = new Map<string, unknown>();
  alarm: number | null = null;
  private transactionTail = Promise.resolve();

  async get<T>(key: string) {
    return this.values.get(key) as T | undefined;
  }

  async put(key: string, value: unknown) {
    this.values.set(key, structuredClone(value));
  }

  async delete(key: string) {
    return this.values.delete(key);
  }

  async deleteAll() {
    this.values.clear();
  }

  async setAlarm(value: number) {
    this.alarm = value;
  }

  async deleteAlarm() {
    this.alarm = null;
  }

  async transaction<T>(closure: (transaction: FakeStorage) => Promise<T>) {
    const previous = this.transactionTail;
    let release!: () => void;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await closure(this);
    } finally {
      release();
    }
  }
}

class FakeSocket {
  readonly messages: string[] = [];
  readonly closes: Array<{ code?: number; reason?: string }> = [];
  private attachment: unknown;

  send(message: string) {
    this.messages.push(message);
  }

  close(code?: number, reason?: string) {
    this.closes.push({ code, reason });
  }

  serializeAttachment(attachment: unknown) {
    this.attachment = attachment;
  }

  deserializeAttachment() {
    return this.attachment;
  }
}

function roomFixture(viewerConnectionCount = 1, observerConnectionCount = 0) {
  const storage = new FakeStorage();
  const socket = new FakeSocket();
  socket.serializeAttachment({ role: "overlay" });
  const viewerSocket = new FakeSocket();
  viewerSocket.serializeAttachment({ role: "viewer" });
  const viewerSockets = [
    viewerSocket,
    ...Array.from(
      { length: Math.max(0, viewerConnectionCount - 1) },
      () => new FakeSocket(),
    ),
  ];
  const observerSockets = Array.from({ length: observerConnectionCount }, () => {
    const observer = new FakeSocket();
    observer.serializeAttachment({ role: "observer" });
    return observer;
  });
  const accepted: string[][] = [];
  const state = {
    storage,
    getWebSockets: (tag?: string) =>
      tag === "viewer" ? viewerSockets : tag === "observer" ? observerSockets : [socket],
    acceptWebSocket: (_socket: unknown, tags: string[]) => accepted.push(tags),
  } as unknown as DurableObjectState;
  return { room: new CaptionRoom(state), socket, storage, viewerSocket, observerSockets, accepted };
}

function request(
  path: string,
  body?: unknown,
  method: "POST" | "DELETE" | "GET" = "POST",
) {
  return new Request(`https://caption-room${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createChannel(room: CaptionRoom) {
  return room.fetch(
    request("/internal/channel", {
      tokenHash: TOKEN_A,
      encryptedToken: "encrypted-a",
      style: { fontSize: 56 },
    }),
  );
}

async function startLiveSession(
  room: CaptionRoom,
  controllerHash = CONTROLLER_A,
  takeover = false,
  viewerTokenHash = controllerHash === CONTROLLER_A ? VIEWER_A : VIEWER_B,
  controllerLabel = controllerHash === CONTROLLER_A ? "first@example.test" : "second@example.test",
) {
  return room.fetch(
    request("/internal/service", {
      controllerHash,
      controllerLabel,
      viewerTokenHash,
      takeover,
      style: { fontSize: 60 },
    }),
  );
}

function caption(
  controllerHash = CONTROLLER_A,
  publicText = "Grace and peace",
  translationRevision = 1,
) {
  return {
    controllerHash,
    publicText,
    targetLanguage: "en",
    style: { horizontalMarginPercent: 8 },
    translationRevision,
  };
}

describe("reusable caption channel", () => {
  it("creates the Main channel idempotently and preserves the first credential", async () => {
    const { room, storage } = roomFixture();
    expect((await createChannel(room)).status).toBe(201);
    expect(
      (
        await room.fetch(
          request("/internal/channel", {
            tokenHash: TOKEN_B,
            encryptedToken: "encrypted-b",
            style: { fontSize: 10 },
          }),
        )
      ).status,
    ).toBe(201);

    await expect(storage.get("configuration")).resolves.toMatchObject({
      tokenHash: TOKEN_A,
      encryptedToken: "encrypted-a",
      status: "idle",
      style: { fontSize: 56 },
    });
  });

  it("normalizes legacy channels without a translation revision", async () => {
    const { room, storage } = roomFixture();
    await createChannel(room);
    const legacy = {
      ...(await storage.get<Record<string, unknown>>("configuration")),
    };
    delete legacy.translationRevision;
    await storage.put("configuration", legacy);

    const channel = await room.fetch(
      request("/internal/channel", undefined, "GET"),
    );
    await expect(channel.json()).resolves.toMatchObject({
      translationRevision: 0,
    });
    await expect(storage.get("configuration")).resolves.toMatchObject({
      translationRevision: 0,
    });

    const started = await startLiveSession(room);
    await expect(started.json()).resolves.toMatchObject({
      translationRevision: 1,
    });
    await expect(storage.get("configuration")).resolves.toMatchObject({
      translationRevision: 1,
    });
  });

  it("blocks a second start and atomically replaces the controller on takeover", async () => {
    const { room, socket, storage, viewerSocket } = roomFixture();
    await createChannel(room);
    const firstStart = await startLiveSession(room);
    expect(firstStart.status).toBe(200);
    await expect(firstStart.json()).resolves.toMatchObject({
      translationRevision: 1,
    });
    const activeConfiguration = await storage.get<Record<string, unknown>>(
      "configuration",
    );
    await storage.put("configuration", {
      ...activeConfiguration,
      lastTranslationRefreshRequestId: REFRESH_REQUEST_A,
    });

    const conflict = await startLiveSession(room, CONTROLLER_B);
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ code: "channel_in_use" });

    const takeover = await startLiveSession(room, CONTROLLER_B, true);
    expect(takeover.status).toBe(200);
    await expect(takeover.json()).resolves.toMatchObject({
      translationRevision: 2,
    });
    await expect(storage.get("configuration")).resolves.toMatchObject({
      controllerHash: CONTROLLER_B,
      viewerTokenHash: VIEWER_B,
    });
    await expect(storage.get("configuration")).resolves.not.toHaveProperty(
      "lastTranslationRefreshRequestId",
    );
    expect(viewerSocket.closes.at(-1)).toEqual({
      code: 4003,
      reason: "Mobile viewer link replaced.",
    });
    const stale = await room.fetch(request("/internal/caption", caption()));
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      code: "controller_replaced",
    });

    const published = await room.fetch(
      request("/internal/caption", caption(CONTROLLER_B, "Grace and peace", 2)),
    );
    await expect(published.json()).resolves.toMatchObject({ sequence: 1 });
    expect(socket.messages.map((message) => JSON.parse(message))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "clear" }),
        expect.objectContaining({ type: "caption" }),
      ]),
    );
  });

  it("requires a distinct per-service viewer credential", async () => {
    const { room, storage } = roomFixture();
    await createChannel(room);

    const missing = await room.fetch(
      request("/internal/service", {
        controllerHash: CONTROLLER_A,
        takeover: false,
        style: {},
      }),
    );
    expect(missing.status).toBe(400);

    expect((await startLiveSession(room)).status).toBe(200);
    await expect(storage.get("configuration")).resolves.toMatchObject({
      tokenHash: TOKEN_A,
      controllerHash: CONTROLLER_A,
      viewerTokenHash: VIEWER_A,
    });
    const channel = await room.fetch(request("/internal/channel", undefined, "GET"));
    await expect(channel.json()).resolves.not.toHaveProperty("viewerTokenHash");
  });

  it("broadcasts captions but never style events or caption style to viewers", async () => {
    const { room, socket, viewerSocket } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    socket.messages.length = 0;
    viewerSocket.messages.length = 0;

    await room.fetch(request("/internal/caption", caption()));
    expect(viewerSocket.messages.map((message) => JSON.parse(message))).toEqual([
      {
        type: "caption",
        caption: expect.objectContaining({
          sequence: 1,
          publicText: "Grace and peace",
          targetLanguage: "en",
        }),
      },
    ]);
    expect(JSON.parse(viewerSocket.messages[0])).not.toHaveProperty(
      "caption.style",
    );

    viewerSocket.messages.length = 0;
    await room.fetch(
      request("/internal/style", {
        controllerHash: CONTROLLER_A,
        style: { fontSize: 64 },
      }),
    );
    expect(viewerSocket.messages).toEqual([]);
    expect(socket.messages.map((message) => JSON.parse(message))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "caption" }),
        expect.objectContaining({ type: "style" }),
      ]),
    );
  });

  it("keeps idle OBS tests off the per-service viewer stream", async () => {
    const { room, viewerSocket } = roomFixture();
    await createChannel(room);
    viewerSocket.messages.length = 0;

    await room.fetch(
      request("/internal/control", {
        action: "show-test",
        targetLanguage: "id",
        style: {},
      }),
    );
    expect(viewerSocket.messages).toEqual([]);

    await startLiveSession(room);
    await room.fetch(
      request("/internal/control", {
        action: "pause",
        controllerHash: CONTROLLER_A,
      }),
    );
    viewerSocket.messages.length = 0;
    await room.fetch(
      request("/internal/control", {
        action: "show-test",
        controllerHash: CONTROLLER_A,
        targetLanguage: "id",
        style: {},
      }),
    );
    expect(viewerSocket.messages.map((message) => JSON.parse(message))).toEqual([
      expect.objectContaining({ type: "caption" }),
    ]);
  });

  it("replaces the viewer link only for the current controller", async () => {
    const { room, storage, socket, viewerSocket } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    socket.closes.length = 0;
    viewerSocket.closes.length = 0;

    const stale = await room.fetch(
      request("/internal/viewer/rotate", {
        controllerHash: CONTROLLER_B,
        viewerTokenHash: VIEWER_B,
      }),
    );
    expect(stale.status).toBe(409);
    expect(viewerSocket.closes).toEqual([]);

    const replaced = await room.fetch(
      request("/internal/viewer/rotate", {
        controllerHash: CONTROLLER_A,
        viewerTokenHash: VIEWER_B,
      }),
    );
    expect(replaced.status).toBe(200);
    await expect(storage.get("configuration")).resolves.toMatchObject({
      tokenHash: TOKEN_A,
      viewerTokenHash: VIEWER_B,
    });
    expect(socket.closes).toEqual([]);
    expect(viewerSocket.closes).toEqual([
      { code: 4003, reason: "Mobile viewer link replaced." },
    ]);
  });

  it("does not accept OBS and mobile-viewer credentials interchangeably", async () => {
    const viewerToken = "v".repeat(43);
    const overlayToken = "o".repeat(43);
    const { room, storage } = roomFixture();
    await createChannel(room);
    const configuration = await storage.get<Record<string, unknown>>("configuration");
    await storage.put("configuration", {
      ...configuration,
      tokenHash: await captionTokenHash(overlayToken),
    });
    await startLiveSession(
      room,
      CONTROLLER_A,
      false,
      await captionTokenHash(viewerToken),
    );

    const viewerWithOverlayToken = await room.fetch(
      new Request("https://caption-room/internal/viewer/connect", {
        headers: {
          upgrade: "websocket",
          "sec-websocket-protocol": `church-caption-viewer-v1, ${overlayToken}`,
        },
      }),
    );
    expect(viewerWithOverlayToken.status).toBe(401);

    const overlayWithViewerToken = await room.fetch(
      new Request("https://caption-room/internal/connect", {
        headers: {
          upgrade: "websocket",
          "sec-websocket-protocol": `church-caption-v1, ${viewerToken}`,
        },
      }),
    );
    expect(overlayWithViewerToken.status).toBe(401);
  });

  it("fails closed when the mobile viewer reaches its connection ceiling", async () => {
    const viewerToken = "v".repeat(43);
    const { room } = roomFixture(250);
    await createChannel(room);
    await startLiveSession(
      room,
      CONTROLLER_A,
      false,
      await captionTokenHash(viewerToken),
    );

    const response = await room.fetch(
      new Request("https://caption-room/internal/viewer/connect", {
        headers: {
          upgrade: "websocket",
          "sec-websocket-protocol": `church-caption-viewer-v1, ${viewerToken}`,
        },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "The mobile viewer is at capacity.",
    });
  });

  it("assigns monotonic sequences across tests, clears, services, and restarts", async () => {
    const { room } = roomFixture();
    await createChannel(room);

    const idleTest = await room.fetch(
      request("/internal/control", {
        action: "show-test",
        targetLanguage: "id",
        style: {},
      }),
    );
    await expect(idleTest.json()).resolves.toMatchObject({ sequence: 1 });
    await room.fetch(request("/internal/control", { action: "clear" }));

    await startLiveSession(room);
    await expect(
      (await room.fetch(request("/internal/caption", caption()))).json(),
    ).resolves.toMatchObject({ sequence: 2 });
    await room.fetch(
      request("/internal/control", {
        action: "pause",
        controllerHash: CONTROLLER_A,
      }),
    );
    await expect(
      (
        await room.fetch(
          request("/internal/control", {
            action: "show-test",
            controllerHash: CONTROLLER_A,
            targetLanguage: "ja",
            style: {},
          }),
        )
      ).json(),
    ).resolves.toMatchObject({ sequence: 3 });
    await room.fetch(
      request("/internal/control", {
        action: "resume",
        controllerHash: CONTROLLER_A,
      }),
    );
    await expect(
      (await room.fetch(request("/internal/caption", { ...caption(), captionEpoch: 2 }))).json(),
    ).resolves.toMatchObject({ sequence: 4 });

    await room.fetch(
      request(
        "/internal/service",
        { controllerHash: CONTROLLER_A },
        "DELETE",
      ),
    );
    await startLiveSession(room, CONTROLLER_B);
    await expect(
      (
        await room.fetch(
          request(
            "/internal/caption",
            caption(CONTROLLER_B, "Next service", 2),
          ),
        )
      ).json(),
    ).resolves.toMatchObject({ sequence: 5 });
  });

  it("allows tests while idle or paused but never while live", async () => {
    const { room } = roomFixture();
    await createChannel(room);
    expect(
      (
        await room.fetch(
          request("/internal/control", {
            action: "show-test",
            targetLanguage: "ko-KR",
            style: {},
          }),
        )
      ).status,
    ).toBe(200);

    await startLiveSession(room);
    expect(
      (
        await room.fetch(
          request("/internal/control", {
            action: "show-test",
            controllerHash: CONTROLLER_A,
            targetLanguage: "ko-KR",
            style: {},
          }),
        )
      ).status,
    ).toBe(409);
  });

  it("shows an operator-typed manual caption to viewers only while paused", async () => {
    const { room, viewerSocket } = roomFixture();
    await createChannel(room);

    expect(
      (
        await room.fetch(
          request("/internal/control", {
            action: "manual",
            targetLanguage: "en",
            manualText: "We will resume shortly.",
          }),
        )
      ).status,
    ).toBe(409);

    await startLiveSession(room);
    expect(
      (
        await room.fetch(
          request("/internal/control", {
            action: "manual",
            controllerHash: CONTROLLER_A,
            targetLanguage: "en",
            manualText: "We will resume shortly.",
          }),
        )
      ).status,
    ).toBe(409);

    await room.fetch(
      request("/internal/control", {
        action: "pause",
        controllerHash: CONTROLLER_A,
      }),
    );
    viewerSocket.messages.length = 0;
    const response = await room.fetch(
      request("/internal/control", {
        action: "manual",
        controllerHash: CONTROLLER_A,
        targetLanguage: "en",
        manualText: "  We will resume shortly.  ",
      }),
    );
    expect(response.status).toBe(200);
    expect(viewerSocket.messages.map((message) => JSON.parse(message))).toEqual([
      expect.objectContaining({
        type: "caption",
        caption: expect.objectContaining({ publicText: "We will resume shortly." }),
      }),
    ]);
  });

  it("rejects a blank or over-length manual caption", async () => {
    const { room } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    await room.fetch(
      request("/internal/control", { action: "pause", controllerHash: CONTROLLER_A }),
    );

    for (const manualText of ["   ", "x".repeat(MAX_MANUAL_CAPTION_CHARS + 1)]) {
      const response = await room.fetch(
        request("/internal/control", {
          action: "manual",
          controllerHash: CONTROLLER_A,
          targetLanguage: "en",
          manualText,
        }),
      );
      expect(response.status).toBe(409);
    }
  });

  it("accepts a manual caption at exactly the character limit", async () => {
    const { room } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    await room.fetch(
      request("/internal/control", { action: "pause", controllerHash: CONTROLLER_A }),
    );
    const response = await room.fetch(
      request("/internal/control", {
        action: "manual",
        controllerHash: CONTROLLER_A,
        targetLanguage: "en",
        manualText: "x".repeat(MAX_MANUAL_CAPTION_CHARS),
      }),
    );
    expect(response.status).toBe(200);
  });

  it("requires the current controller for active captions, controls, and styles", async () => {
    const { room } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);

    for (const [path, body] of [
      ["/internal/caption", caption(CONTROLLER_B)],
      ["/internal/control", { action: "pause", controllerHash: CONTROLLER_B }],
      [
        "/internal/control",
        {
          action: "refresh-translation",
          controllerHash: CONTROLLER_B,
          expectedTranslationRevision: 1,
          refreshRequestId: REFRESH_REQUEST_A,
        },
      ],
      ["/internal/style", { style: {}, controllerHash: CONTROLLER_B }],
    ] as const) {
      const response = await room.fetch(request(path, body));
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        code: "controller_replaced",
      });
    }
  });

  it("reserves one transcription attempt and rejects the stale controller after takeover", async () => {
    const { room } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);

    const valid = await room.fetch(
      request("/internal/lease", { controllerHash: CONTROLLER_A }),
    );
    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toMatchObject({
      valid: true,
      status: "live",
      transcriptionRequests: 1,
      translationRevision: 1,
    });

    await startLiveSession(room, CONTROLLER_B, true);
    const stale = await room.fetch(
      request("/internal/lease", { controllerHash: CONTROLLER_A }),
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      code: "controller_replaced",
    });
  });

  it("authorizes provider work once and persists its usage idempotently", async () => {
    const { room, storage } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    await room.fetch(
      request("/internal/lease", { controllerHash: CONTROLLER_A }),
    );
    const claimed = await room.fetch(
      request("/internal/translation/claim", {
        controllerHash: CONTROLLER_A,
        transcriptionAttempt: 1,
      }),
    );
    expect(claimed.status).toBe(200);
    const duplicateClaim = await room.fetch(
      request("/internal/translation/claim", {
        controllerHash: CONTROLLER_A,
        transcriptionAttempt: 1,
      }),
    );
    expect(duplicateClaim.status).toBe(409);
    await expect(duplicateClaim.json()).resolves.toMatchObject({
      code: "translation_attempt_used",
    });

    const usageRecord = {
      controllerHash: CONTROLLER_A,
      transcriptionAttempt: 1,
      usage: {
        promptTokens: 120,
        completionTokens: 24,
        totalTokens: 144,
      },
      rateLimit: {
        model: "openai/gpt-oss-20b",
        observedAt: "2026-08-23T08:00:00.000Z",
        requestsPerDay: { limit: 1000, remaining: 980, reset: "12h" },
        tokensPerMinute: { limit: 8000, remaining: 7000, reset: "8s" },
      },
    };
    const recorded = await room.fetch(
      request("/internal/usage", usageRecord),
    );
    expect(recorded.status).toBe(200);
    await expect(recorded.json()).resolves.toMatchObject({
      recorded: true,
      llmUsage: {
        translationRequests: 1,
        promptTokens: 120,
        completionTokens: 24,
        totalTokens: 144,
      },
    });

    await room.fetch(request("/internal/usage", usageRecord));
    await expect(storage.get("configuration")).resolves.toMatchObject({
      recordedTranslationAttempts: [1],
      llmUsage: {
        translationRequests: 1,
        totalTokens: 144,
      },
    });
    const channel = await room.fetch(
      request("/internal/channel", undefined, "GET"),
    );
    await expect(channel.json()).resolves.toMatchObject({
      llmUsage: {
        translationRequests: 1,
        promptTokens: 120,
        completionTokens: 24,
        totalTokens: 144,
      },
    });
  });

  it("preserves usage through translation refresh and resets it on takeover", async () => {
    const { room } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    await room.fetch(
      request("/internal/lease", { controllerHash: CONTROLLER_A }),
    );
    await room.fetch(
      request("/internal/translation/claim", {
        controllerHash: CONTROLLER_A,
        transcriptionAttempt: 1,
      }),
    );
    await room.fetch(
      request("/internal/usage", {
        controllerHash: CONTROLLER_A,
        transcriptionAttempt: 1,
        usage: { promptTokens: 40, completionTokens: 8, totalTokens: 48 },
      }),
    );

    await room.fetch(
      request("/internal/control", {
        action: "refresh-translation",
        controllerHash: CONTROLLER_A,
        expectedTranslationRevision: 1,
        refreshRequestId: REFRESH_REQUEST_A,
      }),
    );
    const refreshed = await room.fetch(
      request("/internal/channel", undefined, "GET"),
    );
    await expect(refreshed.json()).resolves.toMatchObject({
      translationRevision: 2,
      llmUsage: { translationRequests: 1, totalTokens: 48 },
    });

    await startLiveSession(room, CONTROLLER_B, true);
    const takenOver = await room.fetch(
      request("/internal/channel", undefined, "GET"),
    );
    await expect(takenOver.json()).resolves.toMatchObject({
      transcriptionRequests: 0,
      llmUsage: {
        translationRequests: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        providerRateLimit: null,
      },
    });

    const stale = await room.fetch(
      request("/internal/usage", {
        controllerHash: CONTROLLER_A,
        transcriptionAttempt: 1,
      }),
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      code: "controller_replaced",
    });
  });

  it("rejects translation usage without a matching reserved attempt", async () => {
    const { room } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);

    const response = await room.fetch(
      request("/internal/usage", {
        controllerHash: CONTROLLER_A,
        transcriptionAttempt: 1,
        usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Translation usage does not match this session.",
    });
  });

  it("enforces the transcription ceiling atomically across controller leases", async () => {
    const { room, storage } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    const configuration = await storage.get<Record<string, unknown>>("configuration");
    await storage.put("configuration", {
      ...configuration,
      transcriptionRequests: MAX_TRANSCRIPTION_REQUESTS - 1,
    });

    const finalLease = await room.fetch(
      request("/internal/lease", { controllerHash: CONTROLLER_A }),
    );
    expect(finalLease.status).toBe(200);
    await expect(finalLease.json()).resolves.toMatchObject({
      transcriptionRequests: MAX_TRANSCRIPTION_REQUESTS,
    });

    const blocked = await room.fetch(
      request("/internal/lease", { controllerHash: CONTROLLER_A }),
    );
    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toMatchObject({
      code: "transcription_limit_reached",
    });
  });

  it("does not reserve a transcription request while paused", async () => {
    const { room, storage } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    await room.fetch(
      request("/internal/control", {
        action: "pause",
        controllerHash: CONTROLLER_A,
      }),
    );

    const blocked = await room.fetch(
      request("/internal/lease", { controllerHash: CONTROLLER_A }),
    );
    expect(blocked.status).toBe(409);
    await expect(blocked.json()).resolves.toMatchObject({ code: "service_paused" });
    await expect(storage.get("configuration")).resolves.toMatchObject({
      transcriptionRequests: 0,
    });
  });

  it("refreshes a live translation atomically and rejects stale publishes", async () => {
    const { room, storage, socket, viewerSocket } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    await room.fetch(
      request("/internal/lease", { controllerHash: CONTROLLER_A }),
    );
    expect(
      (await room.fetch(request("/internal/caption", caption()))).status,
    ).toBe(200);
    const before = await storage.get<Record<string, unknown>>("configuration");
    const alarmBefore = storage.alarm;
    socket.messages.length = 0;
    socket.closes.length = 0;
    viewerSocket.messages.length = 0;
    viewerSocket.closes.length = 0;

    const conflicting = await room.fetch(
      request("/internal/control", {
        action: "refresh-translation",
        controllerHash: CONTROLLER_A,
        expectedTranslationRevision: 99,
        refreshRequestId: REFRESH_REQUEST_A,
      }),
    );
    expect(conflicting.status).toBe(409);
    await expect(conflicting.json()).resolves.toMatchObject({
      code: "translation_session_refreshed",
      translationRevision: 1,
    });

    const refreshed = await room.fetch(
      request("/internal/control", {
        action: "refresh-translation",
        controllerHash: CONTROLLER_A,
        expectedTranslationRevision: 1,
        refreshRequestId: REFRESH_REQUEST_A,
      }),
    );
    expect(refreshed.status).toBe(200);
    await expect(refreshed.json()).resolves.toEqual({
      action: "refresh-translation",
      status: "live",
      translationRevision: 2,
    });
    await expect(storage.get("configuration")).resolves.toEqual({
      ...before,
      translationRevision: 2,
      inferenceAttemptFloor: 1,
      captionEpoch: 1,
      lastTranslationRefreshRequestId: REFRESH_REQUEST_A,
    });
    expect(storage.alarm).toBe(alarmBefore);
    expect(await storage.get("latest")).toBeUndefined();
    expect(socket.messages.map((message) => JSON.parse(message))).toEqual([
      { type: "clear" },
    ]);
    expect(viewerSocket.messages.map((message) => JSON.parse(message))).toEqual([
      { type: "clear" },
    ]);
    expect(socket.closes).toEqual([]);
    expect(viewerSocket.closes).toEqual([]);

    socket.messages.length = 0;
    viewerSocket.messages.length = 0;
    const retry = await room.fetch(
      request("/internal/control", {
        action: "refresh-translation",
        controllerHash: CONTROLLER_A,
        expectedTranslationRevision: 1,
        refreshRequestId: REFRESH_REQUEST_A,
      }),
    );
    await expect(retry.json()).resolves.toEqual({
      action: "refresh-translation",
      status: "live",
      translationRevision: 2,
    });
    await expect(storage.get("configuration")).resolves.toMatchObject({
      translationRevision: 2,
    });
    expect(socket.messages).toEqual([]);
    expect(viewerSocket.messages).toEqual([]);

    const otherTab = await room.fetch(
      request("/internal/control", {
        action: "refresh-translation",
        controllerHash: CONTROLLER_A,
        expectedTranslationRevision: 1,
        refreshRequestId: REFRESH_REQUEST_B,
      }),
    );
    expect(otherTab.status).toBe(409);
    await expect(otherTab.json()).resolves.toMatchObject({
      code: "translation_session_refreshed",
      translationRevision: 2,
    });
    await expect(storage.get("configuration")).resolves.toMatchObject({
      translationRevision: 2,
      lastTranslationRefreshRequestId: REFRESH_REQUEST_A,
    });

    const stale = await room.fetch(
      request("/internal/caption", caption(CONTROLLER_A, "Old result", 1)),
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      code: "translation_session_refreshed",
      translationRevision: 2,
    });
    expect(await storage.get("latest")).toBeUndefined();

    const current = await room.fetch(
      request("/internal/caption", { ...caption(CONTROLLER_A, "New result", 2), captionEpoch: 1 }),
    );
    expect(current.status).toBe(200);
    await expect(current.json()).resolves.toMatchObject({
      sequence: 2,
      translationRevision: 2,
    });
  });

  it("refreshes translation while paused without changing the paused service", async () => {
    const { room, storage, socket, viewerSocket } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    await room.fetch(
      request("/internal/lease", { controllerHash: CONTROLLER_A }),
    );
    await room.fetch(
      request("/internal/control", {
        action: "pause",
        controllerHash: CONTROLLER_A,
      }),
    );
    await room.fetch(
      request("/internal/control", {
        action: "show-test",
        controllerHash: CONTROLLER_A,
        targetLanguage: "id",
        style: {},
      }),
    );
    expect(await storage.get("latest")).toBeDefined();
    const before = await storage.get<Record<string, unknown>>("configuration");
    const alarmBefore = storage.alarm;
    socket.messages.length = 0;
    socket.closes.length = 0;
    viewerSocket.messages.length = 0;
    viewerSocket.closes.length = 0;

    const refreshed = await room.fetch(
      request("/internal/control", {
        action: "refresh-translation",
        controllerHash: CONTROLLER_A,
        expectedTranslationRevision: 1,
        refreshRequestId: REFRESH_REQUEST_A,
      }),
    );

    await expect(refreshed.json()).resolves.toEqual({
      action: "refresh-translation",
      status: "paused",
      translationRevision: 2,
    });
    await expect(storage.get("configuration")).resolves.toEqual({
      ...before,
      translationRevision: 2,
      lastTranslationRefreshRequestId: REFRESH_REQUEST_A,
      captionEpoch: 2,
    });
    expect(storage.alarm).toBe(alarmBefore);
    expect(await storage.get("latest")).toBeUndefined();
    expect(socket.messages.map((message) => JSON.parse(message))).toEqual([
      { type: "clear" },
    ]);
    expect(viewerSocket.messages.map((message) => JSON.parse(message))).toEqual([
      { type: "clear" },
    ]);
    expect(socket.closes).toEqual([]);
    expect(viewerSocket.closes).toEqual([]);
  });

  it("ends a service without deleting or changing the reusable OBS credential", async () => {
    const { room, storage, socket, viewerSocket } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    await room.fetch(request("/internal/caption", caption()));
    await room.fetch(
      request("/internal/lease", { controllerHash: CONTROLLER_A }),
    );
    await room.fetch(
      request("/internal/translation/claim", {
        controllerHash: CONTROLLER_A,
        transcriptionAttempt: 1,
      }),
    );
    await room.fetch(
      request("/internal/usage", {
        controllerHash: CONTROLLER_A,
        transcriptionAttempt: 1,
        usage: { promptTokens: 20, completionTokens: 4, totalTokens: 24 },
      }),
    );

    const response = await room.fetch(
      request(
        "/internal/service",
        { controllerHash: CONTROLLER_A },
        "DELETE",
      ),
    );
    expect(response.status).toBe(204);
    // Internal hint for the Worker's automatic summary; never forwarded to the browser.
    expect(response.headers.get("x-ended-service")).toEqual(expect.any(String));
    expect(response.headers.get("x-ended-saved")).toMatch(/^[01]$/u);
    await expect(storage.get("configuration")).resolves.toMatchObject({
      tokenHash: TOKEN_A,
      encryptedToken: "encrypted-a",
      status: "idle",
      lastSequence: 1,
      transcriptionRequests: 0,
      claimedTranslationAttempts: [],
      recordedTranslationAttempts: [],
      llmUsage: {
        translationRequests: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        providerRateLimit: null,
      },
    });
    await expect(storage.get("configuration")).resolves.not.toHaveProperty(
      "viewerTokenHash",
    );
    expect(await storage.get("latest")).toBeUndefined();
    expect(JSON.parse(socket.messages.at(-1)!)).toMatchObject({
      type: "state",
      status: "idle",
    });
    expect(viewerSocket.closes.at(-1)).toEqual({
      code: 4002,
      reason: "Live session ended.",
    });
  });

  it("rotates only while idle and closes sockets using the revocation code", async () => {
    const { room, socket, storage } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    expect(
      (
        await room.fetch(
          request("/internal/rotate", {
            tokenHash: TOKEN_B,
            encryptedToken: "encrypted-b",
          }),
        )
      ).status,
    ).toBe(409);

    await room.fetch(
      request(
        "/internal/service",
        { controllerHash: CONTROLLER_A },
        "DELETE",
      ),
    );
    expect(
      (
        await room.fetch(
          request("/internal/rotate", {
            tokenHash: TOKEN_B,
            encryptedToken: "encrypted-b",
          }),
        )
      ).status,
    ).toBe(200);
    await expect(storage.get("configuration")).resolves.toMatchObject({
      tokenHash: TOKEN_B,
      encryptedToken: "encrypted-b",
      status: "idle",
    });
    expect(socket.closes.at(-1)).toEqual({
      code: 4001,
      reason: "OBS channel link rotated.",
    });
  });

  it("expires only the active service and leaves the channel ready", async () => {
    const { room, storage, socket, viewerSocket } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    await room.fetch(request("/internal/caption", caption()));

    const active = await storage.get<{ expiresAt: number }>("configuration");
    const now = vi.spyOn(Date, "now").mockReturnValue(active!.expiresAt + 1);
    try { await room.alarm(); } finally { now.mockRestore(); }
    await expect(storage.get("configuration")).resolves.toMatchObject({
      tokenHash: TOKEN_A,
      status: "idle",
    });
    await expect(storage.get("configuration")).resolves.not.toHaveProperty(
      "viewerTokenHash",
    );
    expect(await storage.get("latest")).toBeUndefined();
    expect(JSON.parse(socket.messages.at(-1)!)).toMatchObject({
      type: "state",
      status: "idle",
    });
    expect(viewerSocket.closes.at(-1)).toEqual({
      code: 4002,
      reason: "Live session ended.",
    });
  });

  it("clears stale public output when a style update observes service expiry", async () => {
    const { room, storage, socket } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    await room.fetch(request("/internal/caption", caption()));
    const configuration = await storage.get<Record<string, unknown>>("configuration");
    await storage.put("configuration", {
      ...configuration,
      expiresAt: Date.now() - 1,
    });

    const response = await room.fetch(
      request("/internal/style", {
        controllerHash: CONTROLLER_A,
        style: { fontSize: 64 },
      }),
    );

    expect(response.status).toBe(200);
    await expect(storage.get("configuration")).resolves.toMatchObject({
      status: "idle",
      style: { fontSize: 64 },
    });
    expect(await storage.get("latest")).toBeUndefined();
    expect(socket.messages.map((message) => JSON.parse(message))).toEqual(
      expect.arrayContaining([
        { type: "clear" },
        { type: "state", status: "idle", expiresAt: null },
      ]),
    );
  });

  it("clears public sockets when a usage record observes service expiry", async () => {
    const { room, storage, socket, viewerSocket } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    await room.fetch(request("/internal/caption", caption()));
    await room.fetch(
      request("/internal/lease", { controllerHash: CONTROLLER_A }),
    );
    await room.fetch(
      request("/internal/translation/claim", {
        controllerHash: CONTROLLER_A,
        transcriptionAttempt: 1,
      }),
    );
    const configuration = await storage.get<Record<string, unknown>>(
      "configuration",
    );
    await storage.put("configuration", {
      ...configuration,
      expiresAt: Date.now() - 1,
    });

    const response = await room.fetch(
      request("/internal/usage", {
        controllerHash: CONTROLLER_A,
        transcriptionAttempt: 1,
        usage: { promptTokens: 20, completionTokens: 4, totalTokens: 24 },
      }),
    );

    expect(response.status).toBe(410);
    expect(socket.messages.map((message) => JSON.parse(message))).toEqual(
      expect.arrayContaining([
        { type: "clear" },
        { type: "state", status: "idle", expiresAt: null },
      ]),
    );
    expect(viewerSocket.closes.at(-1)).toEqual({
      code: 4002,
      reason: "Live session ended.",
    });
  });

  it("rejects messages from both read-only socket roles", () => {
    const { room, socket, viewerSocket } = roomFixture();

    room.webSocketMessage(socket as unknown as WebSocket);
    room.webSocketMessage(viewerSocket as unknown as WebSocket);

    expect(socket.closes.at(-1)).toEqual({
      code: 1008,
      reason: "The OBS overlay is read-only.",
    });
    expect(viewerSocket.closes.at(-1)).toEqual({
      code: 1008,
      reason: "The mobile viewer is read-only.",
    });
  });

  it("serializes a caption immediately before takeover and leaves OBS clear", async () => {
    const { room, socket, storage } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);

    const pendingCaption = room.fetch(request("/internal/caption", caption()));
    const pendingTakeover = startLiveSession(room, CONTROLLER_B, true);
    const [captionResponse, takeoverResponse] = await Promise.all([
      pendingCaption,
      pendingTakeover,
    ]);
    expect(captionResponse.status).toBe(200);
    expect(takeoverResponse.status).toBe(200);
    expect(await storage.get("latest")).toBeUndefined();
    expect(
      socket.messages.map((message) => JSON.parse(message)).at(-3),
    ).toEqual({ type: "clear" });
  });
});

describe("transcription dispatch enforcement", () => {
  const controller = "c".repeat(43);
  const transcribeRequest = (attempt = 1, token = controller, path = "/api/ai/transcribe") =>
    new Request(`https://caption.example${path}`, {
      method: "POST",
      headers: { "x-caption-controller": token, "x-caption-transcription-attempt": String(attempt) },
      body: "synthetic audio placeholder",
    });

  async function dispatchFixture() {
    const fixture = roomFixture();
    const hash = await captionTokenHash(controller);
    await createChannel(fixture.room);
    await startLiveSession(fixture.room, hash);
    await fixture.room.fetch(request("/internal/lease", { controllerHash: hash }));
    const roomFetch = vi.fn((req: Request) => fixture.room.fetch(req));
    const env: LiveWorkerEnvironment = {
      CAPTION_LOCAL_AUTH_BYPASS: "true",
      CAPTION_ROOMS: { idFromName: () => "main", get: () => ({ fetch: roomFetch }) },
    };
    const provider = vi.fn(async () => Response.json({ segments: [] }));
    return { ...fixture, hash, env, provider, roomFetch };
  }

  it("carries the issued controller and reservation through both browser inference stages", async () => {
    const { room, storage } = roomFixture();
    const env: LiveWorkerEnvironment = {
      CAPTION_LOCAL_AUTH_BYPASS: "true",
      OBS_CHANNEL_ENCRYPTION_KEY: "synthetic-encryption-key-at-least-32-characters",
      CAPTION_ROOMS: { idFromName: () => "main", get: () => room },
    };
    const provider = vi.fn(async (req: Request) => {
      if (new URL(req.url).pathname === "/api/ai/transcribe") {
        return Response.json({ segments: [{ text: "Grace", isFinal: true }] });
      }
      return Response.json({
        text: "Kasih karunia",
        usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
      });
    });
    const browserFetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const req = new Request(
        input instanceof Request ? input : new URL(String(input), "https://caption.example"),
        init,
      );
      const liveResponse = await handleLiveApiRequest(req, env);
      return liveResponse ?? handleInferenceRequest(req, env, () => provider(req));
    });

    try {
      const live = new LiveSessionClient();
      const cloud = new CloudProviderClient();
      const style = normalizeCaptionStyle({});
      await live.createChannel(style);
      const liveSession = await live.startLiveSession(style);
      const lease = await live.reserveTranscriptionAttempt(liveSession.controllerToken);
      const context = {
        controllerToken: liveSession.controllerToken,
        transcriptionAttempt: lease.transcriptionRequests,
      };
      const transcription = await cloud.transcribe({
        audio: new Blob(["synthetic"], { type: "audio/webm" }),
        sourceLanguage: "en",
        keywordHints: [],
      }, context);
      const translation = await cloud.translate({
        text: transcription.segments[0].text,
        sourceLanguage: "en",
        targetLanguage: "id",
        recentContext: [],
        preferredTerms: {},
      }, context);
      await live.publish(liveSession.controllerToken, {
        publicText: translation.text,
        targetLanguage: "id",
        style,
        translationRevision: lease.translationRevision,
      });

      expect(provider).toHaveBeenCalledTimes(2);
      expect(await storage.get("configuration")).toMatchObject({
        transcriptionRequests: 1,
        claimedTranscriptionAttempts: [1],
        claimedTranslationAttempts: [1],
        llmUsage: { translationRequests: 1, totalTokens: 12 },
      });
      expect(await storage.get("latest")).toMatchObject({ publicText: "Kasih karunia" });

      // A fresh browser request still cannot reuse an already consumed reservation.
      await expect(cloud.translate({
        text: "Grace",
        sourceLanguage: "en",
        targetLanguage: "id",
        recentContext: [],
        preferredTerms: {},
      }, context)).rejects.toMatchObject({ code: "translation_attempt_used" });
      expect(provider).toHaveBeenCalledTimes(2);
    } finally {
      browserFetch.mockRestore();
    }
  });

  it.each(["missing controller", "missing attempt", "stale controller", "paused", "expired", "unreserved", "above ceiling", "refreshed"])(
    "never dispatches for %s", async (reason) => {
      const { room, storage, hash, env, provider } = await dispatchFixture();
      const req = transcribeRequest(
        reason === "unreserved" ? 2 : reason === "above ceiling" ? 901 : 1,
        reason === "stale controller" ? "d".repeat(43) : controller,
      );
      if (reason === "missing controller") req.headers.delete("x-caption-controller");
      if (reason === "missing attempt") req.headers.delete("x-caption-transcription-attempt");
      if (reason === "paused") await room.fetch(request("/internal/control", { action: "pause", controllerHash: hash }));
      if (reason === "expired") {
        await storage.put("configuration", { ...await storage.get<object>("configuration"), expiresAt: Date.now() - 1 });
      }
      if (reason === "refreshed") await room.fetch(request("/internal/control", {
        action: "refresh-translation", controllerHash: hash,
        expectedTranslationRevision: 1, refreshRequestId: REFRESH_REQUEST_A,
      }));
      expect((await handleInferenceRequest(req, env, provider)).ok).toBe(false);
      expect(provider).not.toHaveBeenCalled();
    },
  );

  it("authorizes Access before a claim and fails closed when storage is unavailable", async () => {
    const { env, provider, roomFetch } = await dispatchFixture();
    delete env.CAPTION_LOCAL_AUTH_BYPASS;
    expect((await handleInferenceRequest(transcribeRequest(), env, provider)).ok).toBe(false);
    expect(roomFetch).not.toHaveBeenCalled();
    env.CAPTION_LOCAL_AUTH_BYPASS = "true";
    roomFetch.mockRejectedValueOnce(new Error("storage unavailable"));
    const response = await handleInferenceRequest(transcribeRequest(), env, provider);
    expect(response.status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
  });

  it.each(["/api/ai/transcribe/", "/api/ai/%74ranscribe", "/api//ai/transcribe", "/api/ai/transcribe%2f", "/api/ai/translate/"])(
    "rejects the route alias %s before routing to Next", async (path) => {
      const { env, provider, roomFetch } = await dispatchFixture();
      expect((await handleInferenceRequest(transcribeRequest(1, controller, path), env, provider)).status).toBe(400);
      expect(roomFetch).not.toHaveBeenCalled();
      expect(provider).not.toHaveBeenCalled();
    },
  );

  it("dispatches concurrent duplicates once and still permits one translation for the attempt", async () => {
    const { env, provider, storage } = await dispatchFixture();
    const responses = await Promise.all([
      handleInferenceRequest(transcribeRequest(), env, provider),
      handleInferenceRequest(transcribeRequest(), env, provider),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(provider).toHaveBeenCalledOnce();
    const translate = vi.fn(async () => Response.json({
      text: "Grace", usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
    }));
    expect((await handleInferenceRequest(transcribeRequest(1, controller, "/api/ai/translate"), env, translate)).status).toBe(200);
    expect((await handleInferenceRequest(transcribeRequest(1, controller, "/api/ai/translate"), env, translate)).status).toBe(409);
    expect(translate).toHaveBeenCalledOnce();
    expect(await storage.get("configuration")).toMatchObject({
      claimedTranscriptionAttempts: [1], claimedTranslationAttempts: [1],
      llmUsage: { translationRequests: 1, totalTokens: 12 },
    });
  });

  it.each(["transcribe", "translate"])("rejects Next data aliases for %s before provider routing", async (stage) => {
    const { env, provider, roomFetch } = await dispatchFixture();
    const path = `/_next/data/build/api/ai/${stage}.json`;
    expect((await handleInferenceRequest(transcribeRequest(1, controller, path), env, provider)).status).toBe(404);
    expect(roomFetch).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("does not refund a claim after failed provider work or room reload", async () => {
    const { env, provider, storage } = await dispatchFixture();
    provider.mockResolvedValueOnce(Response.json({ error: "upstream timeout" }, { status: 504 }));
    expect((await handleInferenceRequest(transcribeRequest(), env, provider)).status).toBe(504);
    const reloaded = new CaptionRoom({ storage, getWebSockets: () => [] } as unknown as DurableObjectState);
    env.CAPTION_ROOMS.get = () => reloaded;
    expect((await handleInferenceRequest(transcribeRequest(), env, provider)).status).toBe(409);
    expect(provider).toHaveBeenCalledOnce();
  });

  it("dispatches the last ceiling attempt once, never one more", async () => {
    const { room, storage, hash, env, provider } = await dispatchFixture();
    await storage.put("configuration", { ...await storage.get<object>("configuration"), transcriptionRequests: MAX_TRANSCRIPTION_REQUESTS - 1 });
    expect((await room.fetch(request("/internal/lease", { controllerHash: hash }))).status).toBe(200);
    expect((await handleInferenceRequest(transcribeRequest(MAX_TRANSCRIPTION_REQUESTS), env, provider)).status).toBe(200);
    expect((await handleInferenceRequest(transcribeRequest(MAX_TRANSCRIPTION_REQUESTS), env, provider)).status).toBe(409);
    expect((await room.fetch(request("/internal/lease", { controllerHash: hash }))).status).toBe(429);
    expect((await handleInferenceRequest(transcribeRequest(MAX_TRANSCRIPTION_REQUESTS + 1), env, provider)).status).toBe(400);
    expect(provider).toHaveBeenCalledOnce();
  });

  it("invalidates old reservations on Pause and safely migrates untracked legacy attempts", async () => {
    const { room, storage, hash, env, provider } = await dispatchFixture();
    await room.fetch(request("/internal/control", { action: "pause", controllerHash: hash }));
    await room.fetch(request("/internal/control", { action: "resume", controllerHash: hash }));
    expect((await handleInferenceRequest(transcribeRequest(), env, provider)).status).toBe(400);
    const legacy = await storage.get<Record<string, unknown>>("configuration");
    delete legacy!.inferenceAttemptFloor;
    delete legacy!.claimedTranscriptionAttempts;
    await storage.put("configuration", legacy);
    expect((await handleInferenceRequest(transcribeRequest(), env, provider)).status).toBe(400);
    await room.fetch(request("/internal/lease", { controllerHash: hash }));
    expect((await handleInferenceRequest(transcribeRequest(2), env, provider)).status).toBe(200);
    expect(provider).toHaveBeenCalledOnce();
  });
});

describe("workspace watchers", () => {
  const identity = (suffix: string) => `operator:${suffix.repeat(64)}`;
  const observerToken = "o".repeat(43);

  function observe(identityKey: string, observerHash: string) {
    return request("/internal/experience/observer", { identityKey, observerHash });
  }

  function viewerConnect(token: string) {
    return new Request("https://caption-room/internal/viewer/connect", {
      headers: {
        upgrade: "websocket",
        "sec-websocket-protocol": `church-caption-viewer-v1, ${token}`,
      },
    });
  }

  it("registers one read-only credential per operator identity without touching the controller", async () => {
    const { room, storage } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);

    const response = await room.fetch(observe(identity("1"), "a".repeat(64)));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      saveHistory: false,
      controllerLabel: "first@example.test",
      status: "live",
      translationRevision: 1,
    });

    await room.fetch(observe(identity("2"), "b".repeat(64)));
    const configuration = await storage.get<{
      controllerHash: string;
      viewerTokenHash: string;
      observers: Record<string, string>;
    }>("configuration");
    expect(configuration?.controllerHash).toBe(CONTROLLER_A);
    expect(configuration?.viewerTokenHash).toBe(VIEWER_A);
    expect(Object.values(configuration!.observers)).toEqual(["a".repeat(64), "b".repeat(64)]);
  });

  it("keeps the newest MAX_SESSION_OBSERVERS identities and refuses malformed registrations", async () => {
    const { room, storage } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);

    // One more than the cap, so the first registration is the one evicted.
    const numbered = (index: number) => index.toString(16).padStart(64, "0");
    for (let index = 0; index <= MAX_SESSION_OBSERVERS; index += 1) {
      const key = `operator:${numbered(index)}`;
      expect((await room.fetch(observe(key, numbered(index)))).status).toBe(200);
    }
    const configuration = await storage.get<{ observers: Record<string, string> }>("configuration");
    expect(Object.keys(configuration!.observers)).toHaveLength(MAX_SESSION_OBSERVERS);
    expect(configuration!.observers[`operator:${numbered(0)}`]).toBeUndefined();
    expect(configuration!.observers[`operator:${numbered(MAX_SESSION_OBSERVERS)}`])
      .toBe(numbered(MAX_SESSION_OBSERVERS));

    expect((await room.fetch(observe("operator:short", "c".repeat(64)))).status).toBe(400);
    expect((await room.fetch(observe(identity("1"), "not-a-hash"))).status).toBe(400);
  });

  it("names the operator who started the service and forgets the name when it ends", async () => {
    const { room } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    await expect((await room.fetch(request("/internal/channel", undefined, "GET"))).json())
      .resolves.toMatchObject({ controllerLabel: "first@example.test", status: "live" });

    await startLiveSession(room, CONTROLLER_B, true);
    await expect((await room.fetch(request("/internal/channel", undefined, "GET"))).json())
      .resolves.toMatchObject({ controllerLabel: "second@example.test" });

    await room.fetch(request("/internal/service", { controllerHash: CONTROLLER_B }, "DELETE"));
    const idle = await (await room.fetch(request("/internal/channel", undefined, "GET"))).json() as {
      controllerLabel?: string;
      status: string;
    };
    expect(idle.status).toBe("idle");
    expect(idle.controllerLabel).toBeUndefined();
  });

  it("refuses to register a watcher when no service is running", async () => {
    const { room } = roomFixture();
    await createChannel(room);
    const response = await room.fetch(observe(identity("1"), "a".repeat(64)));
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ code: "service_inactive" });
  });

  it("sends the viewer the session's format snapshot on ready, and none for a session without one", async () => {
    const viewerToken = "v".repeat(43);
    for (const withSnapshot of [true, false]) {
      const { room, storage } = roomFixture();
      await createChannel(room);
      await room.fetch(request("/internal/session", {
        controllerHash: CONTROLLER_A, viewerTokenHash: await captionTokenHash(viewerToken), takeover: false,
        style: { fontSize: 60 }, presetId: "builtin:sermon",
      }));
      if (!withSnapshot) {
        // A session stored before formats has no snapshot.
        const stored = storage.values.get("configuration") as Record<string, unknown>;
        delete stored.preset;
      }
      const pairs: Array<{ 0: FakeSocket; 1: FakeSocket }> = [];
      class FakePair {
        readonly 0 = new FakeSocket();
        readonly 1 = new FakeSocket();
        constructor() { pairs.push(this); }
      }
      vi.stubGlobal("WebSocketPair", FakePair);
      try {
        await room.fetch(viewerConnect(viewerToken)).catch(() => null);
      } finally {
        vi.unstubAllGlobals();
      }
      const ready = JSON.parse(pairs[0]![1].messages[0]!) as { type: string; preset?: { id: string; terms: { en: { session: { singular: string } } } } };
      expect(ready.type).toBe("ready");
      if (withSnapshot) expect(ready.preset).toMatchObject({ id: "builtin:sermon", terms: { en: { session: { singular: "service" } } } });
      else expect(ready).not.toHaveProperty("preset");
    }
  });

  it("accepts a registered watcher on the public caption socket and rejects an unregistered one", async () => {
    const { room, accepted } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    await room.fetch(observe(identity("1"), await captionTokenHash(observerToken)));

    expect((await room.fetch(viewerConnect("z".repeat(43)))).status).toBe(401);
    expect(accepted).toEqual([]);

    class FakePair {
      readonly 0 = new FakeSocket();
      readonly 1 = new FakeSocket();
    }
    vi.stubGlobal("WebSocketPair", FakePair);
    try {
      // The Workers-only 101 response cannot be constructed under Node; the
      // accepted tag proves the credential passed and the socket is a watcher.
      await room.fetch(viewerConnect(observerToken)).catch(() => null);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(accepted).toEqual([["observer"]]);
  });

  it("accepts a registered watcher on the current viewer subprotocol and on the earlier one", async () => {
    for (const protocol of ["caption-studio-viewer-v1", "church-caption-viewer-v1"]) {
      const { room, accepted } = roomFixture();
      await createChannel(room);
      await startLiveSession(room);
      await room.fetch(observe(identity("1"), await captionTokenHash(observerToken)));
      class FakePair {
        readonly 0 = new FakeSocket();
        readonly 1 = new FakeSocket();
      }
      vi.stubGlobal("WebSocketPair", FakePair);
      try {
        await room.fetch(new Request("https://caption-room/internal/viewer/connect", {
          headers: { upgrade: "websocket", "sec-websocket-protocol": `${protocol}, ${observerToken}` },
        })).catch(() => null);
      } finally {
        vi.unstubAllGlobals();
      }
      expect(accepted).toEqual([["observer"]]);
    }
  });

  it("broadcasts public captions to watchers and keeps them through a viewer-link replacement", async () => {
    const { room, observerSockets } = roomFixture(1, 1);
    await createChannel(room);
    await startLiveSession(room);
    await room.fetch(request("/internal/caption", caption()));

    expect(observerSockets[0]!.messages.map((message) => JSON.parse(message)).at(-1)).toEqual({
      type: "caption",
      caption: expect.objectContaining({ publicText: "Grace and peace" }),
    });

    // Start already invalidated pre-session sockets; a later link swap must not.
    const closesBeforeRotation = observerSockets[0]!.closes.length;
    await room.fetch(
      request("/internal/viewer/rotate", {
        controllerHash: CONTROLLER_A,
        viewerTokenHash: VIEWER_B,
      }),
    );
    expect(observerSockets[0]!.closes).toHaveLength(closesBeforeRotation);
  });

  it("disconnects watchers and clears their credentials when the service ends", async () => {
    const { room, observerSockets, storage } = roomFixture(1, 1);
    await createChannel(room);
    await startLiveSession(room);
    await room.fetch(observe(identity("1"), "a".repeat(64)));

    await room.fetch(request("/internal/service", { controllerHash: CONTROLLER_A }, "DELETE"));

    expect(observerSockets[0]!.closes.at(-1)).toEqual({
      code: 4002,
      reason: "Live session ended.",
    });
    const configuration = await storage.get<{ observers?: unknown }>("configuration");
    expect(configuration?.observers).toBeUndefined();
  });
});

describe("stored session names", () => {
  it("keeps a configuration written with serviceId controllable and stores sessionId on the next write", async () => {
    const { room, storage } = roomFixture();
    await createChannel(room);
    expect((await startLiveSession(room)).status).toBe(200);
    const stored = storage.values.get("configuration") as Record<string, unknown>;
    const sessionId = stored.sessionId as string;
    const legacy: Record<string, unknown> = { ...stored, serviceId: sessionId, serviceEventCount: stored.sessionEventCount };
    delete legacy.sessionId;
    delete legacy.sessionEventCount;
    storage.values.set("configuration", legacy);

    const rotated = await room.fetch(request("/internal/experience/reader-rotate", { controllerHash: CONTROLLER_A, readerHash: "e".repeat(64) }));
    expect(await rotated.json()).toMatchObject({ serviceId: sessionId });
    const written = storage.values.get("configuration") as Record<string, unknown>;
    expect(written).toMatchObject({ sessionId, sessionEventCount: 0 });
    expect(written).not.toHaveProperty("serviceId");
    expect(written).not.toHaveProperty("serviceEventCount");
  });

  it("stores the chosen format with the session and keeps it until the session ends", async () => {
    const { room, storage } = roomFixture();
    await createChannel(room);
    const start = (presetId?: string, takeover = false) => room.fetch(request("/internal/session", {
      controllerHash: CONTROLLER_A, viewerTokenHash: VIEWER_A, takeover, style: { fontSize: 60 }, ...(presetId ? { presetId } : {}),
    }));
    const started = await (await start("builtin:sermon")).json() as Record<string, unknown>;
    expect(started.presetId).toBe("builtin:sermon");
    expect(storage.values.get("configuration")).toMatchObject({ preset: { id: "builtin:sermon", terms: { en: { session: { singular: "service" } }, id: { session: { singular: "ibadah" } } } } });

    // Nothing in a running session replaces it: another start is refused, and control actions leave it.
    expect((await start("builtin:talkshow")).status).toBe(409);
    expect((await room.fetch(request("/internal/control", { action: "pause", controllerHash: CONTROLLER_A }))).status).toBe(200);
    expect(storage.values.get("configuration")).toMatchObject({ preset: { id: "builtin:sermon" } });
    expect(await (await room.fetch(request("/internal/channel", undefined, "GET"))).json()).toMatchObject({ presetId: "builtin:sermon" });

    // The next session takes its own format.
    await room.fetch(request("/internal/session", { controllerHash: CONTROLLER_A }, "DELETE"));
    expect((await (await start("builtin:keynote")).json() as Record<string, unknown>).presetId).toBe("builtin:keynote");
  });

  it("starts General without a format, and for an unknown or custom id", async () => {
    for (const presetId of [undefined, "builtin:market", "custom:3f2a9c1e-6b7d-4e8f-9a0b-1c2d3e4f5a6b"]) {
      const { room, storage } = roomFixture();
      await createChannel(room);
      const started = await (await room.fetch(request("/internal/session", {
        controllerHash: CONTROLLER_A, viewerTokenHash: VIEWER_A, takeover: false, style: { fontSize: 60 }, ...(presetId ? { presetId } : {}),
      }))).json() as Record<string, unknown>;
      expect(started.presetId, String(presetId)).toBe("builtin:general");
      expect(storage.values.get("configuration")).toMatchObject({ preset: { id: "builtin:general" } });
    }
  });

  it("returns both session and earlier id names, both error code fields and both ended headers", async () => {
    const { room, storage } = roomFixture();
    await createChannel(room);
    const started = await (await room.fetch(request("/internal/session", { controllerHash: CONTROLLER_A, controllerLabel: "first@example.test", viewerTokenHash: VIEWER_A, takeover: false, style: { fontSize: 60 } }))).json() as Record<string, unknown>;
    const sessionId = (storage.values.get("configuration") as Record<string, unknown>).sessionId;
    expect(started).toMatchObject({ sessionId, serviceId: sessionId });

    const paused = await room.fetch(request("/internal/control", { action: "pause", controllerHash: CONTROLLER_A }));
    expect(paused.status).toBe(200);
    const history = await (await room.fetch(request("/internal/history"))).json() as { sessions: unknown[]; services: unknown[] };
    expect(history.sessions).toEqual(history.services);

    const ended = await room.fetch(request("/internal/session", { controllerHash: CONTROLLER_A }, "DELETE"));
    expect(ended.headers.get("x-ended-session")).toBe(sessionId);
    expect(ended.headers.get("x-ended-service")).toBe(sessionId);
  });

  it("starts and ends a session under the internal session route and the older service route", async () => {
    const { room } = roomFixture();
    await createChannel(room);
    const started = await room.fetch(request("/internal/session", { controllerHash: CONTROLLER_A, controllerLabel: "first@example.test", viewerTokenHash: VIEWER_A, takeover: false, style: { fontSize: 60 } }));
    expect(started.status).toBe(200);
    expect((await room.fetch(request("/internal/session", { controllerHash: CONTROLLER_A }, "DELETE"))).status).toBe(204);
    expect((await room.fetch(request("/internal/service", { controllerHash: CONTROLLER_A, controllerLabel: "first@example.test", viewerTokenHash: VIEWER_A, takeover: false, style: { fontSize: 60 } }))).status).toBe(200);
    expect((await room.fetch(request("/internal/service", { controllerHash: CONTROLLER_A }, "DELETE"))).status).toBe(204);
  });

  it("accepts sessionId and the pre-session serviceId in the experience request body", async () => {
    const { room, storage } = roomFixture();
    await createChannel(room);
    await startLiveSession(room);
    const sessionId = (storage.values.get("configuration") as Record<string, unknown>).sessionId as string;
    expect(await (await room.fetch(request("/internal/experience/remove-current", { sessionId, sourceIds: [] }))).json()).toEqual({ cleared: true });
    expect(await (await room.fetch(request("/internal/experience/remove-current", { serviceId: sessionId, sourceIds: [] }))).json()).toEqual({ cleared: true });
    expect(await (await room.fetch(request("/internal/experience/remove-current", { sessionId: "not-the-session", sourceIds: [] }))).json()).toEqual({ ignored: true });
  });
});
