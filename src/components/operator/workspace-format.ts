import { presetLocalizedText, type Preset, type PresetLocale } from "@/experience/presets";

/** The workspace format as the top bar shows it: a link to Settings › Presets, or plain text while a session runs. */
export function workspaceFormatView(preset: Preset, locale: PresetLocale, sessionLive: boolean) {
  return {
    name: presetLocalizedText(preset.name, locale),
    href: sessionLive ? null : "#settings=presets",
  };
}
