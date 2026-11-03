import type { OperatorScreenId } from "@/components/operator/OperatorTopBar";

export type SettingsSectionId =
  | "computer"
  | "presets"
  | "languages"
  | "words"
  | "look"
  | "obs"
  | "translator"
  | "summary"
  | "usage";

export const SETTINGS_SECTION_IDS: readonly SettingsSectionId[] = [
  "computer",
  "presets",
  "languages",
  "words",
  "look",
  "obs",
  "translator",
  "summary",
  "usage",
];

// Bookmarks from the old sidebar layout still land on the matching screen.
const LEGACY_WORKSPACE_ROUTES: Record<string, string> = {
  overview: "live",
  manualOverride: "settings=words",
  history: "transcripts",
  audio: "settings=computer",
  translation: "settings=languages",
  appearance: "settings=look",
  outputs: "settings=obs",
  prompt: "settings=translator",
  summary: "settings=summary",
  usage: "settings=usage",
};

export function routeFromHash(hash: string): { screen: OperatorScreenId; section: SettingsSectionId } {
  let route = hash.replace(/^#/u, "");
  if (route.startsWith("workspace=")) route = LEGACY_WORKSPACE_ROUTES[route.slice(10)] ?? "live";
  const [screen, section] = route.split("=");
  const settingsSection = SETTINGS_SECTION_IDS.includes(section as SettingsSectionId)
    ? (section as SettingsSectionId)
    : "computer";
  // The older #sermons address still opens Transcripts.
  if (screen === "sermons" || screen === "transcripts") return { screen: "transcripts", section: settingsSection };
  if (screen === "help") return { screen, section: settingsSection };
  if (screen === "settings") return { screen, section: settingsSection };
  return { screen: "live", section: settingsSection };
}
