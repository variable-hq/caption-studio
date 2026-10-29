import { describe, expect, it, vi } from "vitest";

import { createBackgroundTimerBookkeeping, type TimerRuntime } from "@/live/background-timer";

function runtime(useWorker = true) {
  const messages: Array<{ type: string; id: number; ms?: number; repeat?: boolean }> = [];
  let timeoutCallback: (() => void) | null = null;
  const fallback = {
    setTimeout: vi.fn((callback: () => void, ms: number) => {
      void ms;
      timeoutCallback = callback;
      return 101;
    }),
    clearTimeout: vi.fn(),
    setInterval: vi.fn(() => 201),
    clearInterval: vi.fn(),
  };
  const value: TimerRuntime = {
    useWorker,
    send: (message) => messages.push(message),
    fallback,
  };
  return { value, messages, fallback, fireFallbackTimeout: () => timeoutCallback?.() };
}

describe("background timer bookkeeping", () => {
  it("fires a timeout once and stops a repeating interval when cleared", () => {
    const testRuntime = runtime();
    const timers = createBackgroundTimerBookkeeping(testRuntime.value);
    const timeout = vi.fn();
    const interval = vi.fn();
    const timeoutId = timers.setTimeout(timeout, 50);
    const intervalId = timers.setInterval(interval, 20);

    timers.fire(timeoutId);
    timers.fire(timeoutId);
    timers.fire(intervalId);
    timers.fire(intervalId);
    timers.clearInterval(intervalId);
    timers.fire(intervalId);

    expect(timeout).toHaveBeenCalledTimes(1);
    expect(interval).toHaveBeenCalledTimes(2);
    expect(testRuntime.messages).toEqual([
      { type: "start", id: timeoutId, ms: 50, repeat: false },
      { type: "start", id: intervalId, ms: 20, repeat: true },
      { type: "stop", id: intervalId },
    ]);
  });

  it("uses browser timer fallbacks when the worker is unavailable", () => {
    const testRuntime = runtime(false);
    const timers = createBackgroundTimerBookkeeping(testRuntime.value);
    const callback = vi.fn();
    const id = timers.setTimeout(callback, 75);
    expect(testRuntime.fallback.setTimeout).toHaveBeenCalledTimes(1);
    testRuntime.fireFallbackTimeout();
    expect(callback).toHaveBeenCalledOnce();
    const intervalId = timers.setInterval(callback, 25);
    timers.clearInterval(intervalId);
    timers.clearTimeout(id);
    expect(testRuntime.fallback.clearTimeout).not.toHaveBeenCalled();
    expect(testRuntime.fallback.clearInterval).toHaveBeenCalledWith(201);
    expect(testRuntime.messages).toEqual([]);
  });

  it("allocates ids without collisions across timer kinds", () => {
    const timers = createBackgroundTimerBookkeeping(runtime().value);
    expect(timers.setTimeout(() => {}, 1)).not.toBe(timers.setInterval(() => {}, 1));
  });
});
