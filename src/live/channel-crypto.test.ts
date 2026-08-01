import { describe, expect, it } from "vitest";

import {
  ChannelEncryptionError,
  decryptOverlayToken,
  encryptOverlayToken,
} from "@/live/channel-crypto";

const KEY = "a-secure-test-key-with-at-least-32-characters";

describe("OBS channel credential encryption", () => {
  it("round-trips a token without embedding plaintext", async () => {
    const encrypted = await encryptOverlayToken("reusable-overlay-token", KEY);

    expect(encrypted).not.toContain("reusable-overlay-token");
    await expect(decryptOverlayToken(encrypted, KEY)).resolves.toBe(
      "reusable-overlay-token",
    );
  });

  it("uses a fresh IV for every encryption", async () => {
    const first = await encryptOverlayToken("same-token", KEY);
    const second = await encryptOverlayToken("same-token", KEY);

    expect(first).not.toBe(second);
    await expect(decryptOverlayToken(first, KEY)).resolves.toBe("same-token");
    await expect(decryptOverlayToken(second, KEY)).resolves.toBe("same-token");
  });

  it("fails closed for missing, short, wrong, or malformed keys and payloads", async () => {
    await expect(encryptOverlayToken("token", undefined)).rejects.toBeInstanceOf(
      ChannelEncryptionError,
    );
    await expect(encryptOverlayToken("token", "short")).rejects.toBeInstanceOf(
      ChannelEncryptionError,
    );
    const encrypted = await encryptOverlayToken("token", KEY);
    await expect(
      decryptOverlayToken(encrypted, "a-different-key-with-at-least-32-characters"),
    ).rejects.toBeInstanceOf(ChannelEncryptionError);
    await expect(decryptOverlayToken("not-valid", KEY)).rejects.toBeInstanceOf(
      ChannelEncryptionError,
    );
  });
});
