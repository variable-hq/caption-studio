import { describe, expect, it, vi } from "vitest";
import {
  liveScreenDefaultsChanged,
  liveScreenDefaultsPatch,
  saveLiveScreenDefaults,
  type LiveScreenChoices,
  type LiveScreenSavedDefaults,
} from "./live-screen-defaults";

const choices = (overrides: Partial<LiveScreenChoices> = {}): LiveScreenChoices => ({
  hasSession: false,
  saveHistory: false,
  outputBufferCount: 0,
  outputBufferDwellMs: 3_000,
  ...overrides,
});

const saved = (overrides: Partial<LiveScreenSavedDefaults> = {}): LiveScreenSavedDefaults => ({
  saveHistoryDefault: false,
  outputBufferCount: 0,
  outputBufferDwellMs: 3_000,
  ...overrides,
});

const messages = { saving: "Saving…", saved: "Saved.", failed: "Couldn’t save." };

describe("Live screen saved defaults", () => {
  it("needs a save when the transcript choice differs before a service", () => {
    expect(liveScreenDefaultsChanged(choices({ saveHistory: true }), saved())).toBe(true);
    expect(liveScreenDefaultsChanged(choices({ saveHistory: true }), saved({ saveHistoryDefault: null }))).toBe(true);
    expect(liveScreenDefaultsChanged(choices({ saveHistory: true }), saved({ saveHistoryDefault: true }))).toBe(false);
  });

  it("ignores the transcript choice during a service because it is not visible", () => {
    expect(
      liveScreenDefaultsChanged(
        choices({ hasSession: true, saveHistory: true }),
        saved({ saveHistoryDefault: false }),
      ),
    ).toBe(false);
  });

  it("compares choices with the built-in values while nothing has been saved", () => {
    const unsaved = saved({
      saveHistoryDefault: null,
      outputBufferCount: null,
      outputBufferDwellMs: null,
    });
    expect(liveScreenDefaultsChanged(choices(), unsaved)).toBe(false);
    expect(liveScreenDefaultsChanged(choices({ saveHistory: true }), unsaved)).toBe(true);
    expect(liveScreenDefaultsChanged(choices({ outputBufferCount: 1 }), unsaved)).toBe(true);
    expect(
      liveScreenDefaultsChanged(
        choices({ outputBufferCount: 1, outputBufferDwellMs: 2_000 }),
        unsaved,
      ),
    ).toBe(true);
    expect(liveScreenDefaultsChanged(choices({ outputBufferDwellMs: 5_000 }), unsaved)).toBe(false);
    expect(
      liveScreenDefaultsChanged(choices({ hasSession: true, saveHistory: true }), unsaved),
    ).toBe(false);
  });

  it("needs a save when the output buffer wait differs, and ignores the dwell while Off", () => {
    // A never-saved wait matches the built-in Off default, so nothing is pending.
    expect(liveScreenDefaultsChanged(choices(), saved({ outputBufferCount: null }))).toBe(false);
    expect(
      liveScreenDefaultsChanged(choices({ outputBufferCount: 1, outputBufferDwellMs: 2_000 }), saved()),
    ).toBe(true);
    expect(
      liveScreenDefaultsChanged(
        choices({ outputBufferCount: 1, outputBufferDwellMs: 2_000 }),
        saved({ outputBufferCount: 1, outputBufferDwellMs: 2_000 }),
      ),
    ).toBe(false);
    expect(
      liveScreenDefaultsChanged(
        choices({ outputBufferDwellMs: 5_000 }),
        saved({ outputBufferCount: 0, outputBufferDwellMs: 1_000 }),
      ),
    ).toBe(false);
    expect(
      liveScreenDefaultsChanged(
        choices({ outputBufferCount: 1, outputBufferDwellMs: 2_000 }),
        saved({ outputBufferCount: 1, outputBufferDwellMs: null }),
      ),
    ).toBe(true);
  });

  it("saves only the choices visible before a service", () => {
    expect(liveScreenDefaultsPatch(choices({ saveHistory: true }))).toEqual({
      saveHistoryDefault: true,
      outputBufferCount: 0,
      outputBufferDwellMs: 3_000,
    });
  });

  it("saves only the output buffer wait during a service", () => {
    expect(
      liveScreenDefaultsPatch(
        choices({ hasSession: true, saveHistory: true, outputBufferCount: 1, outputBufferDwellMs: 5_000 }),
      ),
    ).toEqual({ outputBufferCount: 1, outputBufferDwellMs: 5_000 });
  });

  it("reports saving then the saved outcome and returns success", async () => {
    const report = vi.fn();
    const save = vi.fn(async () => true);
    await expect(saveLiveScreenDefaults({ choices: choices(), save, report, messages })).resolves.toBe(true);
    expect(report.mock.calls).toEqual([[messages.saving], [messages.saved]]);
    expect(save).toHaveBeenCalledWith({
      saveHistoryDefault: false,
      outputBufferCount: 0,
      outputBufferDwellMs: 3_000,
    });
  });

  it("reports a failure without touching the local choices", async () => {
    const report = vi.fn();
    const current = choices({ saveHistory: true, outputBufferCount: 1, outputBufferDwellMs: 2_000 });
    const before = { ...current };
    await expect(
      saveLiveScreenDefaults({
        choices: current,
        save: async () => false,
        report,
        messages,
      }),
    ).resolves.toBe(false);
    expect(report.mock.calls).toEqual([[messages.saving], [messages.failed]]);
    expect(current).toEqual(before);
    expect(liveScreenDefaultsChanged(current, saved())).toBe(true);
  });

  it("treats a rejected save as a failure", async () => {
    const report = vi.fn();
    await expect(
      saveLiveScreenDefaults({
        choices: choices({ outputBufferCount: 1 }),
        save: async () => {
          throw new Error("unavailable");
        },
        report,
        messages,
      }),
    ).resolves.toBe(false);
    expect(report).toHaveBeenLastCalledWith(messages.failed);
  });
});
