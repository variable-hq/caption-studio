import { describe, expect, it } from "vitest";

import {
  initialSpeechGateState,
  observeSpeechSample,
  shouldSendWindow,
  MIN_WINDOW_SPEECH_MS,
} from "@/live/speech-gate";

describe("silent-window gating", () => {
  it("sends the first window before the session has heard speech", () => {
    expect(shouldSendWindow(initialSpeechGateState(), {
      speechMs: 0,
      peakRms: 0.2,
      levelReadFailed: false,
    })).toBe(true);
  });

  it("learns the speech peak from active samples and keeps it through silence", () => {
    let state = initialSpeechGateState();
    expect(observeSpeechSample(state, 0.2).speech).toBe(true);
    state = observeSpeechSample(state, 0.2).state;
    expect(state.heardSpeech).toBe(true);
    expect(state.peakRms).toBeCloseTo(0.2, 2);
    const silence = observeSpeechSample(state, 0.01);
    expect(silence.speech).toBe(false);
    expect(silence.state.heardSpeech).toBe(true);
    expect(silence.state.peakRms).toBe(state.peakRms);
    const activity = observeSpeechSample(state, 0.05);
    expect(activity.state.peakRms).toBeLessThan(state.peakRms);
  });

  it("keeps skipping a sustained quiet stretch after speech", () => {
    let state = observeSpeechSample(initialSpeechGateState(), 0.2).state;
    for (let index = 0; index < 600; index += 1) {
      state = observeSpeechSample(state, 0.01).state;
    }
    expect(state.peakRms).toBeCloseTo(0.2, 2);
    expect(shouldSendWindow(state, {
      speechMs: 0,
      peakRms: 0.01,
      levelReadFailed: false,
    })).toBe(false);
  });

  it("keeps failing open during a loud transient", () => {
    const transient = observeSpeechSample(initialSpeechGateState(), 0.8).state;
    expect(shouldSendWindow(transient, {
      speechMs: 0,
      peakRms: 0.8,
      levelReadFailed: false,
    })).toBe(true);
  });

  it("recovers normal speech after a loud transient", () => {
    let state = observeSpeechSample(initialSpeechGateState(), 0.8).state;
    let speechSamples = 0;
    for (let index = 0; index < 40; index += 1) {
      const observed = observeSpeechSample(state, 0.08);
      state = observed.state;
      if (observed.speech) speechSamples += 1;
    }
    expect(speechSamples).toBeGreaterThan(0);
    expect(shouldSendWindow(state, {
      speechMs: speechSamples * 100,
      peakRms: 0.08,
      levelReadFailed: false,
    })).toBe(true);
  });

  it("sends a soft passage after loud passages", () => {
    let state = initialSpeechGateState();
    for (let index = 0; index < 20; index += 1) {
      state = observeSpeechSample(state, 0.6).state;
    }
    let speechSamples = 0;
    for (let index = 0; index < 40; index += 1) {
      const observed = observeSpeechSample(state, 0.1);
      state = observed.state;
      if (observed.speech) speechSamples += 1;
    }
    expect(speechSamples).toBeGreaterThan(0);
    expect(shouldSendWindow(state, {
      speechMs: speechSamples * 100,
      peakRms: 0.1,
      levelReadFailed: false,
    })).toBe(true);
  });

  it("skips a silent window once speech has been heard", () => {
    const state = { heardSpeech: true, peakRms: 0.2 };
    expect(shouldSendWindow(state, { speechMs: 0, peakRms: 0.01, levelReadFailed: false })).toBe(false);
    expect(shouldSendWindow(state, {
      speechMs: MIN_WINDOW_SPEECH_MS - 100,
      peakRms: 0.01,
      levelReadFailed: false,
    })).toBe(false);
  });

  it("sends a window that contains enough speech", () => {
    expect(shouldSendWindow({ heardSpeech: true, peakRms: 0.2 }, {
      speechMs: MIN_WINDOW_SPEECH_MS,
      peakRms: 0.2,
      levelReadFailed: false,
    })).toBe(true);
  });

  it("never silences a quiet microphone", () => {
    expect(shouldSendWindow({ heardSpeech: true, peakRms: 0.04 }, {
      speechMs: 0,
      peakRms: 0.03,
      levelReadFailed: false,
    })).toBe(true);
  });

  it("sends the window when a level sample could not be read", () => {
    expect(shouldSendWindow({ heardSpeech: true, peakRms: 0.2 }, {
      speechMs: 0,
      peakRms: 0,
      levelReadFailed: true,
    })).toBe(true);
  });
});
