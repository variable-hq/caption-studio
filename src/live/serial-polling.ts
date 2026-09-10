export function startSerialPolling(task: () => Promise<void>, delayMs: number) {
  let stopped = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (!stopped) timeout = setTimeout(run, delayMs);
  };
  const run = () => void task().then(schedule, schedule);

  run();
  return () => {
    stopped = true;
    if (timeout !== undefined) clearTimeout(timeout);
  };
}
