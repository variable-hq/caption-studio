type TimerMessage =
  | { type: "start"; id: number; ms: number; repeat: boolean }
  | { type: "stop"; id: number };

const timers = new Map<number, ReturnType<typeof setTimeout>>();

self.addEventListener("message", (event: MessageEvent<TimerMessage>) => {
  const message = event.data;
  if (message.type === "stop") {
    const handle = timers.get(message.id);
    if (handle !== undefined) clearTimeout(handle);
    timers.delete(message.id);
    return;
  }

  const schedule = () => {
    const handle = setTimeout(() => {
      if (!timers.has(message.id)) return;
      self.postMessage({ type: "fire", id: message.id });
      if (message.repeat) schedule();
      else timers.delete(message.id);
    }, Math.max(0, message.ms));
    timers.set(message.id, handle);
  };

  const previous = timers.get(message.id);
  if (previous !== undefined) clearTimeout(previous);
  schedule();
});
