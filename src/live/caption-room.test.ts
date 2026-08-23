import { describe, expect, it } from "vitest";

import { CaptionRoom, captionTokenHash } from "@/live/caption-room";
import { MAX_TRANSCRIPTION_REQUESTS } from "@/live/contracts";

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

function roomFixture(viewerConnectionCount = 1) {
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
  const state = {
    storage,
    getWebSockets: (tag?: string) =>
      tag === "viewer" ? viewerSockets : [socket],
    acceptWebSocket: () => undefined,
  } as unknown as DurableObjectState;
  return { room: new CaptionRoom(state), socket, storage, viewerSocket };
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

async function startService(
  room: CaptionRoom,
  controllerHash = CONTROLLER_A,
  takeover = false,
  viewerTokenHash = controllerHash === CONTROLLER_A ? VIEWER_A : VIEWER_B,
) {
  return room.fetch(
    request("/internal/service", {
      controllerHash,
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

    const started = await startService(room);
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
    const firstStart = await startService(room);
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

    const conflict = await startService(room, CONTROLLER_B);
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ code: "channel_in_use" });

    const takeover = await startService(room, CONTROLLER_B, true);
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

    expect((await startService(room)).status).toBe(200);
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
    await startService(room);
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

    await startService(room);
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
    await startService(room);
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
    await startService(
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
    await startService(
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

    await startService(room);
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
      (await room.fetch(request("/internal/caption", caption()))).json(),
    ).resolves.toMatchObject({ sequence: 4 });

    await room.fetch(
      request(
        "/internal/service",
        { controllerHash: CONTROLLER_A },
        "DELETE",
      ),
    );
    await startService(room, CONTROLLER_B);
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

    await startService(room);
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

  it("requires the current controller for active captions, controls, and styles", async () => {
    const { room } = roomFixture();
    await createChannel(room);
    await startService(room);

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
    await startService(room);

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

    await startService(room, CONTROLLER_B, true);
    const stale = await room.fetch(
      request("/internal/lease", { controllerHash: CONTROLLER_A }),
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      code: "controller_replaced",
    });
  });

  it("enforces the transcription ceiling atomically across controller leases", async () => {
    const { room, storage } = roomFixture();
    await createChannel(room);
    await startService(room);
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
    await startService(room);
    await room.fetch(
      request("/internal/control", {
        action: "pause",
        controllerHash: CONTROLLER_A,
      }),
    );

    const blocked = await room.fetch(
      request("/internal/lease", { controllerHash: CONTROLLER_A }),
    );
    expect(blocked.status).toBe(410);
    await expect(storage.get("configuration")).resolves.toMatchObject({
      transcriptionRequests: 0,
    });
  });

  it("refreshes a live translation atomically and rejects stale publishes", async () => {
    const { room, storage, socket, viewerSocket } = roomFixture();
    await createChannel(room);
    await startService(room);
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
      request("/internal/caption", caption(CONTROLLER_A, "New result", 2)),
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
    await startService(room);
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
    await startService(room);
    await room.fetch(request("/internal/caption", caption()));

    const response = await room.fetch(
      request(
        "/internal/service",
        { controllerHash: CONTROLLER_A },
        "DELETE",
      ),
    );
    expect(response.status).toBe(204);
    await expect(storage.get("configuration")).resolves.toMatchObject({
      tokenHash: TOKEN_A,
      encryptedToken: "encrypted-a",
      status: "idle",
      lastSequence: 1,
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
      reason: "Live service ended.",
    });
  });

  it("rotates only while idle and closes sockets using the revocation code", async () => {
    const { room, socket, storage } = roomFixture();
    await createChannel(room);
    await startService(room);
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
    await startService(room);
    await room.fetch(request("/internal/caption", caption()));

    await room.alarm();
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
      reason: "Live service ended.",
    });
  });

  it("clears stale public output when a style update observes service expiry", async () => {
    const { room, storage, socket } = roomFixture();
    await createChannel(room);
    await startService(room);
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
    await startService(room);

    const pendingCaption = room.fetch(request("/internal/caption", caption()));
    const pendingTakeover = startService(room, CONTROLLER_B, true);
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
