import { afterEach, describe, expect, it, vi } from "vitest";

import { startSerialPolling } from "@/live/serial-polling";

describe("serial polling", () => {
  afterEach(() => vi.useRealTimers());

  it("waits for the current task before scheduling the next poll", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const task = vi.fn(
      () => new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const stop = startSerialPolling(task, 5_000);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(task).toHaveBeenCalledOnce();

    finish();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(task).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);
    stop();
  });
});
