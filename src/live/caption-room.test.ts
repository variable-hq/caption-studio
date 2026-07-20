import { describe, expect, it } from "vitest";

import { CaptionRoom } from "@/live/caption-room";

class FakeStorage {
  readonly values = new Map<string, unknown>();
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

  async setAlarm() {}

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

  send(message: string) {
    this.messages.push(message);
  }

  close() {}
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

function request(path: string, body: unknown) {
  return new Request(`https://caption-room${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("caption room controls", () => {
  it("keeps sequence order while pausing, clearing, testing, and resuming", async () => {
    const { room, socket, storage } = roomFixture();
    const expiresAt = Date.now() + 60_000;
    expect(
      (
        await room.fetch(
          request("/internal/initialize", {
            tokenHash: "hash",
            expiresAt,
            style: {},
          }),
        )
      ).status,
    ).toBe(200);

    expect(
      (
        await room.fetch(
          request("/internal/caption", {
            sequence: 1,
            publicText: "Live caption",
            targetLanguage: "en",
            style: {},
          }),
        )
      ).status,
    ).toBe(200);

    const pause = await room.fetch(
      request("/internal/control", { action: "pause" }),
    );
    await expect(pause.json()).resolves.toMatchObject({ paused: true });
    expect(await storage.get("latest")).toBeUndefined();

    expect(
      (
        await room.fetch(
          request("/internal/caption", {
            sequence: 2,
            publicText: "Late caption",
            targetLanguage: "en",
            style: {},
          }),
        )
      ).status,
    ).toBe(409);

    const test = await room.fetch(
      request("/internal/control", {
        action: "show-test",
        targetLanguage: "id",
        style: { horizontalMarginPercent: 12, verticalMarginPercent: 9 },
      }),
    );
    await expect(test.json()).resolves.toMatchObject({
      action: "show-test",
      paused: true,
      sequence: 2,
    });
    await expect(storage.get("latest")).resolves.toMatchObject({
      sequence: 2,
      targetLanguage: "id",
      style: { horizontalMarginPercent: 12, verticalMarginPercent: 9 },
    });

    await room.fetch(request("/internal/control", { action: "clear" }));
    expect(await storage.get("latest")).toBeUndefined();
    await room.fetch(request("/internal/control", { action: "resume" }));

    expect(
      (
        await room.fetch(
          request("/internal/caption", {
            sequence: 2,
            publicText: "Repeated sequence",
            targetLanguage: "en",
            style: {},
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await room.fetch(
          request("/internal/caption", {
            sequence: 3,
            publicText: "Resumed caption",
            targetLanguage: "en",
            style: {},
          }),
        )
      ).status,
    ).toBe(200);

    expect(socket.messages.map((message) => JSON.parse(message))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "clear" }),
        expect.objectContaining({ type: "caption" }),
      ]),
    );
  });

  it("requires pause before showing a test caption", async () => {
    const { room } = roomFixture();
    await room.fetch(
      request("/internal/initialize", {
        tokenHash: "hash",
        expiresAt: Date.now() + 60_000,
        style: {},
      }),
    );

    const response = await room.fetch(
      request("/internal/control", {
        action: "show-test",
        targetLanguage: "en",
        style: {},
      }),
    );
    expect(response.status).toBe(409);
  });

  it("orders an in-flight caption before Pause and leaves OBS clear", async () => {
    const { room, socket } = roomFixture();
    await room.fetch(
      request("/internal/initialize", {
        tokenHash: "hash",
        expiresAt: Date.now() + 60_000,
        style: {},
      }),
    );

    const caption = room.fetch(
      request("/internal/caption", {
        sequence: 1,
        publicText: "In-flight caption",
        targetLanguage: "en",
        style: {},
      }),
    );
    const pause = room.fetch(request("/internal/control", { action: "pause" }));
    const [captionResponse, pauseResponse] = await Promise.all([caption, pause]);

    expect(captionResponse.status).toBe(200);
    expect(pauseResponse.status).toBe(200);
    expect(JSON.parse(socket.messages.at(-1)!)).toEqual({ type: "clear" });
  });

  it.each(["pause", "resume", "clear", "show-test"])(
    "expires the %s control and clears room state",
    async (action) => {
      const { room, storage } = roomFixture();
      storage.values.set("configuration", {
        tokenHash: "hash",
        expiresAt: Date.now() - 1,
        style: {},
        paused: false,
        lastSequence: 0,
      });

      const response = await room.fetch(
        request("/internal/control", {
          action,
          targetLanguage: "en",
          style: {},
        }),
      );
      expect(response.status).toBe(410);
      expect(storage.values.size).toBe(0);
    },
  );
});
