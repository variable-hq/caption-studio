import type { CustomPresetsView, PresetCommand } from "./custom-presets";

const ENDPOINT = "/api/live/experience/presets";

/** A refused command; `code` is the server's reason, shown as its own message. */
export class CustomPresetError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CustomPresetError";
  }
}

export type CustomPresetCommandResult = CustomPresetsView & {
  created?: string;
  added?: { fromId: string; id: string }[];
  dropped?: number;
};

async function call(method: "GET" | "POST", body?: unknown): Promise<CustomPresetCommandResult> {
  const response = await fetch(ENDPOINT, {
    method,
    cache: "no-store",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = (await response.json().catch(() => ({}))) as Partial<CustomPresetCommandResult> & { error?: string; code?: string };
  if (!response.ok) throw new CustomPresetError(result.code ?? "unavailable", result.error ?? "Custom presets are unavailable.");
  return result as CustomPresetCommandResult;
}

/** Reads the workspace's custom presets and the plan's allowance. */
export function loadCustomPresets() {
  return call("GET");
}

/** Sends one create, update, delete or import command; the server applies the plan's allowance. */
export function sendPresetCommand(command: PresetCommand) {
  return call("POST", command);
}
