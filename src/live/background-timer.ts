type WorkerMessage = { type: "fire"; id: number };
type StartMessage = { type: "start"; id: number; ms: number; repeat: boolean };
type StopMessage = { type: "stop"; id: number };
type TimerMessage = StartMessage | StopMessage;
type TimerKind = "timeout" | "interval";

export interface TimerRuntime {
  send(message: TimerMessage): void;
  now?(): number;
  fallback: {
    setTimeout(callback: () => void, ms: number): number;
    clearTimeout(id: number): void;
    setInterval(callback: () => void, ms: number): number;
    clearInterval(id: number): void;
  };
  useWorker: boolean;
}

/** Injectable timer bookkeeping, kept independent of browser globals for node tests. */
export function createBackgroundTimerBookkeeping(runtime: TimerRuntime) {
  let nextId = 1;
  let useWorker = runtime.useWorker;
  const now = runtime.now ?? (() => Date.now());
  const callbacks = new Map<number, {
    callback: () => void;
    kind: TimerKind;
    delay: number;
    dueAt: number;
    fallbackId?: number;
    fallbackKind?: TimerKind;
  }>();

  const armFallback = (
    id: number,
    entry: NonNullable<ReturnType<typeof callbacks.get>>,
    delay: number,
    preserveInitialDelay = true,
  ) => {
    if (entry.kind === "timeout") {
      entry.fallbackId = runtime.fallback.setTimeout(() => fire(id), delay);
      entry.fallbackKind = "timeout";
      return;
    }

    if (!preserveInitialDelay) {
      entry.fallbackId = runtime.fallback.setInterval(() => fire(id), entry.delay);
      entry.fallbackKind = "interval";
      return;
    }

    // Use a one-shot first so a worker failure preserves the interval's remaining
    // delay. After that first fallback tick, the browser interval can take over.
    entry.fallbackId = runtime.fallback.setTimeout(() => {
      const current = callbacks.get(id);
      if (!current) return;
      current.fallbackId = undefined;
      current.fallbackKind = undefined;
      fire(id);
      const stillCurrent = callbacks.get(id);
      if (!stillCurrent) return;
      stillCurrent.dueAt = now() + stillCurrent.delay;
      stillCurrent.fallbackId = runtime.fallback.setInterval(() => fire(id), stillCurrent.delay);
      stillCurrent.fallbackKind = "interval";
    }, delay);
    entry.fallbackKind = "timeout";
  };

  const set = (callback: () => void, ms: number, kind: TimerKind) => {
    const id = nextId++;
    const delay = Math.max(0, ms);
    const entry = { callback, kind, delay, dueAt: now() + delay };
    callbacks.set(id, entry);
    if (useWorker) {
      runtime.send({ type: "start", id, ms: delay, repeat: kind === "interval" });
    } else {
      armFallback(id, entry, delay, false);
    }
    return id;
  };

  const fire = (id: number) => {
    const entry = callbacks.get(id);
    if (!entry) return;
    if (entry.kind === "timeout") callbacks.delete(id);
    else entry.dueAt = now() + entry.delay;
    entry.callback();
  };

  const clear = (id: number, kind: TimerKind) => {
    const entry = callbacks.get(id);
    if (!entry || entry.kind !== kind) return;
    callbacks.delete(id);
    if (useWorker) runtime.send({ type: "stop", id });
    else if (entry.fallbackId !== undefined && entry.fallbackKind === "timeout") {
      runtime.fallback.clearTimeout(entry.fallbackId);
    } else if (entry.fallbackId !== undefined) {
      runtime.fallback.clearInterval(entry.fallbackId);
    }
  };

  return {
    fire,
    switchToFallback: () => {
      if (!useWorker) return;
      useWorker = false;
      const timestamp = now();
      for (const [id, entry] of callbacks) {
        armFallback(id, entry, Math.max(0, entry.dueAt - timestamp));
      }
    },
    setTimeout: (callback: () => void, ms: number) => set(callback, ms, "timeout"),
    clearTimeout: (id: number) => clear(id, "timeout"),
    setInterval: (callback: () => void, ms: number) => set(callback, ms, "interval"),
    clearInterval: (id: number) => clear(id, "interval"),
  };
}

let worker: Worker | null = null;
let workerUnavailable = false;
let client: ReturnType<typeof createBackgroundTimerBookkeeping> | null = null;

function getClient() {
  if (client) return client;
  let activeWorker: Worker | null = null;
  if (!workerUnavailable && typeof Worker !== "undefined") {
    try {
      worker ??= new Worker(new URL("./timer-worker.ts", import.meta.url));
      activeWorker = worker;
    } catch {
      workerUnavailable = true;
    }
  } else {
    workerUnavailable = true;
  }

  const runtime: TimerRuntime = {
    useWorker: activeWorker !== null,
    send: (message) => activeWorker?.postMessage(message),
    now: () => Date.now(),
    fallback: {
      setTimeout: (callback, ms) => window.setTimeout(callback, ms),
      clearTimeout: (id) => window.clearTimeout(id),
      setInterval: (callback, ms) => window.setInterval(callback, ms),
      clearInterval: (id) => window.clearInterval(id),
    },
  };
  client = createBackgroundTimerBookkeeping(runtime);
  activeWorker?.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
    if (!workerUnavailable && event.data?.type === "fire") client?.fire(event.data.id);
  });
  activeWorker?.addEventListener("error", () => {
    workerUnavailable = true;
    activeWorker?.terminate();
    if (worker === activeWorker) worker = null;
    client?.switchToFallback();
  });
  return client;
}

export function setBackgroundTimeout(callback: () => void, ms: number): number {
  return getClient().setTimeout(callback, ms);
}

export function clearBackgroundTimeout(id: number): void {
  getClient().clearTimeout(id);
}

export function setBackgroundInterval(callback: () => void, ms: number): number {
  return getClient().setInterval(callback, ms);
}

export function clearBackgroundInterval(id: number): void {
  getClient().clearInterval(id);
}
