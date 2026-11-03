import { describe, expect, it } from "vitest";

import { deactivate, publicConfiguration, storedConfiguration, websocketCredential, type ChannelConfiguration } from "@/live/caption-room-helpers";
import { resolveWorkspacePreset, snapshotPreset } from "@/experience/presets";

const base = {
  tokenHash: "a".repeat(64),
  encryptedToken: "encrypted",
  style: { fontSize: 48 },
  status: "live",
  lastSequence: 0,
  transcriptionRequests: 0,
  llmUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, translationRequests: 0 },
  claimedTranscriptionAttempts: [],
  claimedTranslationAttempts: [],
  recordedTranslationAttempts: [],
  inferenceAttemptFloor: 0,
  translationRevision: 0,
} as unknown as ChannelConfiguration;

describe("stored configuration names", () => {
  it("maps the pre-session names and drops them", () => {
    const current = storedConfiguration({ ...base, serviceId: "session-1", serviceEventCount: 7 });
    expect(current).toMatchObject({ sessionId: "session-1", sessionEventCount: 7 });
    expect(current).not.toHaveProperty("serviceId");
    expect(current).not.toHaveProperty("serviceEventCount");
  });

  it("prefers the current names when both are present", () => {
    expect(storedConfiguration({ ...base, sessionId: "new", serviceId: "old", sessionEventCount: 2, serviceEventCount: 9 }))
      .toMatchObject({ sessionId: "new", sessionEventCount: 2 });
  });

  it("reads a session stored before formats as General, and keeps a valid snapshot", () => {
    expect(storedConfiguration(base)).not.toHaveProperty("preset");
    expect(publicConfiguration(base).presetId).toBe("builtin:general");
    const preset = snapshotPreset(resolveWorkspacePreset("builtin:sermon"));
    expect(storedConfiguration({ ...base, preset })?.preset).toEqual(preset);
    expect(publicConfiguration({ ...base, preset }).presetId).toBe("builtin:sermon");
  });

  it("drops a stored snapshot that is not valid instead of trusting it", () => {
    const preset = snapshotPreset(resolveWorkspacePreset("builtin:sermon"));
    for (const bad of [{ ...preset, id: "custom:x" }, { ...preset, version: 0 }, { ...preset, extra: 1 }, { id: "builtin:sermon" }, "builtin:sermon"]) {
      const current = storedConfiguration({ ...base, preset: bad as never });
      expect(current).not.toHaveProperty("preset");
      expect(publicConfiguration({ ...base, preset: bad as never }).presetId).toBe("builtin:general");
    }
  });

  it("returns undefined for a missing configuration", () => {
    expect(storedConfiguration(undefined)).toBeUndefined();
  });

  it("resets the session event count when a session ends", () => {
    expect(deactivate({ ...base, sessionId: "session-1", sessionEventCount: 5 })).toMatchObject({ status: "idle", sessionEventCount: 0 });
  });
});

describe("websocket subprotocol credentials", () => {
  const token = "t".repeat(43);
  const accepted = ["caption-studio-v1", "church-caption-v1"];
  const request = (protocols: string) => new Request("https://caption.example.test/api/live/overlay", {
    headers: { "sec-websocket-protocol": protocols },
  });

  it("echoes the current subprotocol the client offered", () => {
    expect(websocketCredential(request(`caption-studio-v1, ${token}`), accepted)).toEqual({ token, protocol: "caption-studio-v1" });
  });

  it("accepts the earlier subprotocol and echoes it", () => {
    expect(websocketCredential(request(`church-caption-v1, ${token}`), accepted)).toEqual({ token, protocol: "church-caption-v1" });
  });

  it("rejects a token without an accepted subprotocol or with a malformed token", () => {
    expect(websocketCredential(request(`other-v1, ${token}`), accepted)).toBeNull();
    expect(websocketCredential(request("caption-studio-v1, short"), accepted)).toBeNull();
  });
});
