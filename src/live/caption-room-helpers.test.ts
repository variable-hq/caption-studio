import { describe, expect, it } from "vitest";

import { deactivate, storedConfiguration, type ChannelConfiguration } from "@/live/caption-room-helpers";

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

  it("returns undefined for a missing configuration", () => {
    expect(storedConfiguration(undefined)).toBeUndefined();
  });

  it("resets the session event count when a session ends", () => {
    expect(deactivate({ ...base, sessionId: "session-1", sessionEventCount: 5 })).toMatchObject({ status: "idle", sessionEventCount: 0 });
  });
});
