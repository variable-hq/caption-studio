/** Formats already-split minutes/seconds as e.g. "3m 07s", shared by every place that shows elapsed service time. */
export function formatMinutesSeconds(minutes: number, seconds: number): string {
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}
