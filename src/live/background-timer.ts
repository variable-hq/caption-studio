type WorkerMessage = { type: "fire"; id: number };
type StartMessage = { type: "start"; id: number; ms: number; repeat: boolean };
type StopMessage = { type: "stop"; id: number };
type TimerMessage = StartMessage | StopMessage;
type TimerKind = "timeout" | "interval";

export interface TimerRuntime {
  send(message: TimerMessage): void;
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
  const callbacks = new Map<number, { callback: () => void; kind: TimerKind; fallbackId?: number }>();

  const set = (callback: () => void, ms: number, kind: TimerKind) => {
    const id = nextId++;
    const entry = { callback, kind } as { callback: () => void; kind: TimerKind; fallbackId?: number };
    callbacks.set(id, entry);
    if (runtime.useWorker) {
      runtime.send({ type: "start", id, ms, repeat: kind === "interval" });
    } else if (kind === "timeout") {
      entry.fallbackId = runtime.fallback.setTimeout(() => fire(id), ms);
    } else {
      entry.fallbackId = runtime.fallback.setInterval(() => fire(id), ms);
    }
    return id;
  };

  const fire = (id: number) => {
    const entry = callbacks.get(id);
    if (!entry) return;
    if (entry.kind === "timeout") callbacks.delete(id);
    entry.callback();
  };

  const clear = (id: number, kind: TimerKind) => {
    const entry = callbacks.get(id);
    if (!entry || entry.kind !== kind) return;
    callbacks.delete(id);
    if (runtime.useWorker) runtime.send({ type: "stop", id });
    else if (entry.fallbackId !== undefined && kind === "timeout") runtime.fallback.clearTimeout(entry.fallbackId);
    else if (entry.fallbackId !== undefined) runtime.fallback.clearInterval(entry.fallbackId);
  };

  return {
    fire,
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
    fallback: {
      setTimeout: (callback, ms) => window.setTimeout(callback, ms),
      clearTimeout: (id) => window.clearTimeout(id),
      setInterval: (callback, ms) => window.setInterval(callback, ms),
      clearInterval: (id) => window.clearInterval(id),
    },
  };
  client = createBackgroundTimerBookkeeping(runtime);
  activeWorker?.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
    if (event.data?.type === "fire") client?.fire(event.data.id);
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
