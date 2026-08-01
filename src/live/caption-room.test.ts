import { describe, expect, it } from "vitest";

import { CaptionRoom } from "@/live/caption-room";
import { MAX_TRANSCRIPTION_REQUESTS } from "@/live/contracts";

const CONTROLLER_A = "a".repeat(64);
const CONTROLLER_B = "b".repeat(64);
const TOKEN_A = "1".repeat(64);
const TOKEN_B = "2".repeat(64);

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

  send(message: string) {
    this.messages.push(message);
  }

  close(code?: number, reason?: string) {
    this.closes.push({ code, reason });
  }
}

function roomFixture() {
  const storage = new FakeStorage();
  const socket = new FakeSocket();
  const state = {
    storage,
    getWebSockets: () => [socket],
    acceptWebSocket: () => undefined,
  } as unknown as DurableObjectState;
  return { room: new CaptionRoom(state), socket, storage };
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
) {
  return room.fetch(
    request("/internal/service", {
      controllerHash,
      takeover,
      style: { fontSize: 60 },
    }),
  );
}

function caption(controllerHash = CONTROLLER_A, publicText = "Grace and peace") {
  return {
    controllerHash,
    publicText,
    targetLanguage: "en",
    style: { horizontalMarginPercent: 8 },
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

  it("blocks a second start and atomically replaces the controller on takeover", async () => {
    const { room, socket } = roomFixture();
    await createChannel(room);
    expect((await startService(room)).status).toBe(200);

    const conflict = await startService(room, CONTROLLER_B);
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ code: "channel_in_use" });

    expect((await startService(room, CONTROLLER_B, true)).status).toBe(200);
    const stale = await room.fetch(request("/internal/caption", caption()));
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      code: "controller_replaced",
    });

    const published = await room.fetch(
      request("/internal/caption", caption(CONTROLLER_B)),
    );
    await expect(published.json()).resolves.toMatchObject({ sequence: 1 });
    expect(socket.messages.map((message) => JSON.parse(message))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "clear" }),
        expect.objectContaining({ type: "caption" }),
      ]),
    );
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
          request("/internal/caption", caption(CONTROLLER_B, "Next service")),
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
      ["/internal/style", { style: {}, controllerHash: CONTROLLER_B }],
    ] as const) {
      const response = await room.fetch(request(path, body));
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        code: "controller_replaced",
      });
    }
  });

  it("validates the controller before provider work and rejects it after takeover", async () => {
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

  it("ends a service without deleting or changing the reusable OBS credential", async () => {
    const { room, storage, socket } = roomFixture();
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
    expect(await storage.get("latest")).toBeUndefined();
    expect(JSON.parse(socket.messages.at(-1)!)).toMatchObject({
      type: "state",
      status: "idle",
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
    const { room, storage, socket } = roomFixture();
    await createChannel(room);
    await startService(room);
    await room.fetch(request("/internal/caption", caption()));

    await room.alarm();
    await expect(storage.get("configuration")).resolves.toMatchObject({
      tokenHash: TOKEN_A,
      status: "idle",
    });
    expect(await storage.get("latest")).toBeUndefined();
    expect(JSON.parse(socket.messages.at(-1)!)).toMatchObject({
      type: "state",
      status: "idle",
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
