import { describe, expect, it, vi } from "vitest";

import { createBackgroundTimerBookkeeping, type TimerRuntime } from "@/live/background-timer";

function runtime(useWorker = true) {
  const messages: Array<{ type: string; id: number; ms?: number; repeat?: boolean }> = [];
  let now = 0;
  let nextTimeoutId = 101;
  let nextIntervalId = 201;
  const timeoutCallbacks = new Map<number, () => void>();
  const intervalCallbacks = new Map<number, () => void>();
  const fallback = {
    setTimeout: vi.fn((callback: () => void, ms: number) => {
      void ms;
      const id = nextTimeoutId++;
      timeoutCallbacks.set(id, callback);
      return id;
    }),
    clearTimeout: vi.fn((id: number) => timeoutCallbacks.delete(id)),
    setInterval: vi.fn((callback: () => void) => {
      const id = nextIntervalId++;
      intervalCallbacks.set(id, callback);
      return id;
    }),
    clearInterval: vi.fn((id: number) => intervalCallbacks.delete(id)),
  };
  const value: TimerRuntime = {
    useWorker,
    send: (message) => messages.push(message),
    now: () => now,
    fallback,
  };
  return {
    value,
    messages,
    fallback,
    setNow: (value: number) => { now = value; },
    fireFallbackTimeout: (id = 101) => {
      const callback = timeoutCallbacks.get(id);
      if (!callback) return;
      timeoutCallbacks.delete(id);
      callback();
    },
    fireFallbackInterval: (id = 201) => intervalCallbacks.get(id)?.(),
  };
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

  it("re-arms a worker timeout for its remaining delay and fires it only once", () => {
    const testRuntime = runtime();
    const timers = createBackgroundTimerBookkeeping(testRuntime.value);
    const callback = vi.fn();
    const id = timers.setTimeout(callback, 75);

    testRuntime.setNow(25);
    timers.switchToFallback();

    expect(testRuntime.fallback.setTimeout).toHaveBeenCalledWith(expect.any(Function), 50);
    testRuntime.setNow(75);
    testRuntime.fireFallbackTimeout(101);
    timers.fire(id); // A late worker message must not fire it a second time.
    expect(callback).toHaveBeenCalledOnce();
  });

  it("preserves an interval's remaining delay on failover, then repeats", () => {
    const testRuntime = runtime();
    const timers = createBackgroundTimerBookkeeping(testRuntime.value);
    const callback = vi.fn();
    const id = timers.setInterval(callback, 40);

    testRuntime.setNow(15);
    timers.switchToFallback();

    expect(testRuntime.fallback.setTimeout).toHaveBeenCalledWith(expect.any(Function), 25);
    testRuntime.setNow(40);
    testRuntime.fireFallbackTimeout(101);
    expect(callback).toHaveBeenCalledOnce();
    expect(testRuntime.fallback.setInterval).toHaveBeenCalledWith(expect.any(Function), 40);

    testRuntime.setNow(80);
    testRuntime.fireFallbackInterval(201);
    expect(callback).toHaveBeenCalledTimes(2);
    timers.clearInterval(id);
    testRuntime.fireFallbackInterval(201);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("clears failover timers during both one-shot and interval phases", () => {
    const testRuntime = runtime();
    const timers = createBackgroundTimerBookkeeping(testRuntime.value);
    const timeout = vi.fn();
    const earlyInterval = vi.fn();
    const repeatingInterval = vi.fn();
    const timeoutId = timers.setTimeout(timeout, 50);
    const earlyIntervalId = timers.setInterval(earlyInterval, 20);

    testRuntime.setNow(5);
    timers.switchToFallback();
    timers.clearTimeout(timeoutId);
    timers.clearInterval(earlyIntervalId);
    testRuntime.fireFallbackTimeout(101);
    testRuntime.fireFallbackTimeout(102);
    expect(timeout).not.toHaveBeenCalled();
    expect(earlyInterval).not.toHaveBeenCalled();
    expect(testRuntime.fallback.clearTimeout).toHaveBeenCalledWith(101);
    expect(testRuntime.fallback.clearTimeout).toHaveBeenCalledWith(102);

    const repeatingId = timers.setInterval(repeatingInterval, 20);
    testRuntime.fireFallbackInterval(201);
    expect(repeatingInterval).toHaveBeenCalledOnce();
    timers.clearInterval(repeatingId);
    testRuntime.fireFallbackInterval(201);
    expect(repeatingInterval).toHaveBeenCalledOnce();
    expect(testRuntime.fallback.clearInterval).toHaveBeenCalledWith(201);
  });

  it("allocates ids without collisions across timer kinds", () => {
    const timers = createBackgroundTimerBookkeeping(runtime().value);
    expect(timers.setTimeout(() => {}, 1)).not.toBe(timers.setInterval(() => {}, 1));
  });
});
