import { describe, expect, it } from "vitest";

import { resolveWorkspacePreset } from "@/experience/presets";
import { workspaceFormatView } from "@/components/operator/workspace-format";

describe("workspace format in the top bar", () => {
  it("names each built-in format in both languages", () => {
    expect(workspaceFormatView(resolveWorkspacePreset("builtin:general"), "en", false).name).toBe("General");
    expect(workspaceFormatView(resolveWorkspacePreset("builtin:sermon"), "en", false).name).toBe("Sermon");
    expect(workspaceFormatView(resolveWorkspacePreset("builtin:sermon"), "id", false).name).toBe("Khotbah");
    expect(workspaceFormatView(resolveWorkspacePreset("builtin:talkshow"), "en", false).name).toBe("Talkshow");
    expect(workspaceFormatView(resolveWorkspacePreset("builtin:keynote"), "en", false).name).toBe("Keynote");
  });

  it("links to Settings > Presets only while no session is live", () => {
    const preset = resolveWorkspacePreset("builtin:sermon");
    expect(workspaceFormatView(preset, "en", false).href).toBe("#settings=presets");
    expect(workspaceFormatView(preset, "en", true).href).toBeNull();
  });
});
