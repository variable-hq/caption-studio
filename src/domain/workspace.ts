/**
 * One Cloudflare Access tenant is one workspace. Every signed-in operator shares
 * the same Main channel, saved transcripts and sermon archives, so the name is a
 * single constant rather than per-operator state.
 */
export const WORKSPACE_NAME = "BEST Church workspace";
