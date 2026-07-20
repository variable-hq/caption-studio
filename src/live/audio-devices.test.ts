import { describe, expect, it } from "vitest";

import { chooseAudioInputDevice } from "@/live/audio-devices";

const devices = [{ deviceId: "default" }, { deviceId: "interface-1" }];

describe("chooseAudioInputDevice", () => {
  it("keeps a valid operator selection", () => {
    expect(chooseAudioInputDevice(devices, "interface-1", "default")).toBe("interface-1");
  });

  it("shows the device used by a newly opened microphone stream", () => {
    expect(chooseAudioInputDevice(devices, "", "interface-1")).toBe("interface-1");
  });

  it("falls back to the browser default before the first stream opens", () => {
    expect(chooseAudioInputDevice(devices, "missing")).toBe("default");
  });

  it("uses the first available device when no default entry exists", () => {
    expect(chooseAudioInputDevice([{ deviceId: "interface-1" }], "")).toBe("interface-1");
    expect(chooseAudioInputDevice([], "")).toBe("");
  });
});
