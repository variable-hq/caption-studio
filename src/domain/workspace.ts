/**
 * One Cloudflare Access tenant is one workspace. Every signed-in operator shares
 * the same Main channel, saved transcripts and transcript archives. The name is saved
 * in the shared setup; this constant is the name shown until one is saved.
 */
export const WORKSPACE_NAME = "BEST Church workspace";

export const WORKSPACE_NAME_MAX_CHARS = 60;

const CONTROL_CHARACTERS = /\p{Cc}/u;

/** Whether typed text can be saved as the workspace name. Empty text is valid and means the default name. */
export function isValidWorkspaceNameInput(text: string) {
  const trimmed = text.trim();
  return Array.from(trimmed).length <= WORKSPACE_NAME_MAX_CHARS && !CONTROL_CHARACTERS.test(trimmed);
}

/** The stored name, or null (the default name) when the value is absent, empty or not a valid name. */
export function normalizeWorkspaceName(value: unknown): string | null {
  if (typeof value !== "string" || !isValidWorkspaceNameInput(value)) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
